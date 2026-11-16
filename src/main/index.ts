/* LexiPop - Electron main process */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LexiPopDB } from "./db.js";
import { InputHelper } from "./inputHelper.js";
import { captureWord } from "./capture.js";
import { PopupWindow } from "./popup.js";
import { createTray } from "./tray.js";
import { registerHotkeys } from "./hotkeys.js";
import { lookupWord } from "../providers/index.js";
import type { LookupResult, HistoryItem, FavoriteItem, WordEntry } from "../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let quitting = false; // set when a real quit is underway (tray Quit, dev takeover)
const db = new LexiPopDB();
const input = new InputHelper();
let popup: PopupWindow | null = null;

// Single instance. Packaged: a second launch just shows the existing window.
// Dev: a new instance asks the old one to quit and takes over (so `npm run dev`
// always runs the latest build even if the previous Electron is still in the tray).
const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function acquireInstanceLock(): Promise<boolean> {
  const takeover = !app.isPackaged;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (app.requestSingleInstanceLock({ takeover })) return true;
    if (!takeover) return false;
    await sleepMs(500);
  }
  return false;
}
app.on("second-instance", (_e, _argv, _cwd, data) => {
  const d = data as { takeover?: boolean } | undefined;
  if (d?.takeover) {
    console.log("[LexiPop] newer dev instance starting; quitting this one");
    quitting = true;
    app.quit();
  } else {
    showMain();
  }
});

function rendererUrl(): string {
  const isDev = !app.isPackaged || !!process.env.VITE_DEV_SERVER_URL;
  return isDev ? "http://localhost:5123" : `file://${path.join(__dirname, "../../renderer/index.html")}`;
}

function showMain(): void {
  if (!mainWindow) createWindow();
  mainWindow?.show();
  mainWindow?.focus();
}
const dbReady = db.init().catch((err) => {
  console.error("[LexiPop] DB init failed (continuing without cache):", err);
});

process.on("uncaughtException", (err) => console.error("[LexiPop] uncaughtException:", err));
process.on("unhandledRejection", (err) => console.error("[LexiPop] unhandledRejection:", err));

// NOTE: do not add --disable-features=VizDisplayCompositor or --no-sandbox
// here. Electron must be run from a local (non-OneDrive) folder; see README.

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 520,
    minHeight: 400,
    title: "LexiPop",
    titleBarStyle: "default",
    autoHideMenuBar: true,
    backgroundColor: "#eef4ee",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.on("preload-error", (_e, preloadFile, error) => {
    console.error("[LexiPop] preload error in", preloadFile, error);
  });

  mainWindow.loadURL(rendererUrl());

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  // Safety net: show the window even if ready-to-show never fires
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.warn("[LexiPop] ready-to-show did not fire; showing window anyway");
      mainWindow.show();
    }
  }, 3000);
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error("[LexiPop] did-fail-load", code, desc, url);
  });

  // Close button releases the window (the tray recreates it on demand);
  // the app itself keeps running for the Ctrl+Right-click popup.
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

let busy = false;
async function triggerPopup(source: "hotkey" | "mouse"): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    console.log("[LexiPop] trigger:", source);
    const word = await captureWord(input);
    if (!word) return;
    if (!popup) popup = new PopupWindow(path.join(__dirname, "preload.js"), rendererUrl());
    await popup.showWord(word);
  } catch (err) {
    console.error("[LexiPop] popup trigger failed:", err);
  } finally {
    busy = false;
  }
}

app.whenReady().then(async () => {
  if (!(await acquireInstanceLock())) {
    console.log("[LexiPop] another instance is running; exiting");
    app.quit();
    return;
  }
  await dbReady;
  createWindow();

  createTray(__dirname, {
    openMain: showMain,
    quit: () => { quitting = true; app.quit(); },
  });
  registerHotkeys(() => void triggerPopup("hotkey"));
  input.onTrigger = () => void triggerPopup("mouse");
  input
    .start()
    .then(() => console.log("[LexiPop] Ctrl+Right-click hook active"))
    .catch((err) => console.error("[LexiPop] input helper failed to start:", err));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Tray app: keep running when all windows are closed/hidden
app.on("window-all-closed", () => { /* stay alive in tray */ });

app.on("before-quit", () => {
  if (!quitting) console.log("[LexiPop] quitting");
  quitting = true;
  input.stop();
  popup?.destroy();
  db.close();
});

/* ---- IPC: dictionary lookup ---- */
ipcMain.handle(
  "dictionary:lookup",
  async (_event, word: string, lang: string, force = false): Promise<LookupResult> => {
    if (!word || !word.trim()) {
      return { entry: null, error: "Please enter a word.", warnings: [] };
    }

    const trimmed = word.trim();

    // 1) Check cache first (offline-capable)
    const cached = force ? null : db.getCache(trimmed, lang);
    if (cached) {
      try {
        const entry: WordEntry = JSON.parse(cached.data);
        return {
          entry: { ...entry, fromCache: true },
          error: null,
          warnings: [],
        };
      } catch {
        // fall through to live lookup if cache is corrupt
      }
    }

    // 2) Live lookup via providers
    let result: LookupResult;
    try {
      result = await lookupWord(trimmed, lang);
    } catch (err) {
      return {
        entry: null,
        error: err instanceof Error ? err.message : "Lookup failed.",
        warnings: [],
      };
    }

    // 3) Persist successful lookups to cache + history
    if (result.entry) {
      try {
        db.setCache(trimmed, lang, result.entry);
        db.addHistory(trimmed, lang);
      } catch {
        // cache write failure is non-fatal
      }
    }

    return result;
  }
);

/* ---- IPC: history ---- */
ipcMain.handle("history:get", async (_event, limit: number): Promise<HistoryItem[]> => {
  return db.getHistory(limit);
});
ipcMain.handle("history:clear", async (): Promise<void> => {
  db.clearHistory();
});

/* ---- IPC: favorites ---- */
ipcMain.handle(
  "favorites:get",
  async (): Promise<FavoriteItem[]> => db.getFavorites()
);
ipcMain.handle(
  "favorites:add",
  async (_event, word: string, lang: string, tags: string[]): Promise<void> => {
    db.addFavorite(word, lang, tags);
  }
);
ipcMain.handle(
  "favorites:remove",
  async (_event, word: string, lang: string): Promise<void> => {
    db.removeFavorite(word, lang);
  }
);
ipcMain.handle(
  "favorites:updateTags",
  async (
    _event,
    word: string,
    lang: string,
    tags: string[]
  ): Promise<void> => {
    db.updateFavoriteTags(word, lang, tags);
  }
);

/* ---- IPC: app meta ---- */
ipcMain.handle("app:getVersion", async (): Promise<string> => {
  return app.getVersion();
});
ipcMain.handle("app:getPlatform", async (): Promise<string> => {
  return process.platform;
});

export { db };
