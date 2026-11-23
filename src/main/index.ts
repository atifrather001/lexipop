/* LexiPop - Electron main process */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LexiPopDB } from "./db.js";
import { InputHelper } from "./inputHelper.js";
import { captureWord } from "./capture.js";
import { PopupWindow } from "./popup.js";
import { createTray } from "./tray.js";
import { registerHotkeys } from "./hotkeys.js";
import { lookupWord } from "../providers/index.js";
import { lookupEncyclopedia } from "../providers/wikipedia.js";
import { getRates, type RateTable } from "../providers/rates.js";
import { translateText } from "../providers/textTranslate.js";
import { parseQuantity, convertCurrency, convertUnit, convertTime } from "../shared/convert.js";
import type {
  LookupResult,
  HistoryItem,
  FavoriteItem,
  WordEntry,
  EncyclopediaEntry,
  EncyclopediaResult,
  TextTranslationResult,
} from "../shared/types";
import type { ConversionResult } from "../shared/convert";

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
        try {
          db.addHistory(trimmed, lang);
        } catch {
          // non-fatal
        }
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

/* ---- IPC: encyclopedia (Wikipedia + Wikidata) ---- */
const ENC_TTL_HIT = 30 * 24 * 60 * 60 * 1000; // articles: 30 days
const ENC_TTL_MISS = 7 * 24 * 60 * 60 * 1000; // "no article": retry after 7 days

ipcMain.handle(
  "encyclopedia:lookup",
  async (_event, term: string, lang: string, force = false): Promise<EncyclopediaResult> => {
    const t = (term ?? "").trim();
    if (!t) return { entry: null, error: null };

    if (!force) {
      const cached = db.getEncyclopedia(t, lang);
      if (cached) {
        try {
          const data = JSON.parse(cached.data) as EncyclopediaEntry | null;
          const ttl = data ? ENC_TTL_HIT : ENC_TTL_MISS;
          if (Date.now() - cached.createdAt < ttl) {
            return { entry: data ? { ...data, fromCache: true } : null, error: null };
          }
        } catch {
          // corrupt row: refetch
        }
      }
    }

    try {
      const entry = await lookupEncyclopedia(t, lang);
      try {
        db.setEncyclopedia(t, lang, entry);
      } catch {
        // cache write failure is non-fatal
      }
      return { entry, error: null };
    } catch (err) {
      return { entry: null, error: err instanceof Error ? err.message : "Encyclopedia lookup failed." };
    }
  }
);

/* ---- IPC: number / unit / currency / time conversion ---- */
ipcMain.handle("convert:run", async (_event, text: string): Promise<ConversionResult | null> => {
  const q = parseQuantity(text ?? "");
  if (!q) return null;
  if (q.kind === "time") {
    return convertTime(q, Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  if (q.kind !== "currency") return convertUnit(q);

  let stored: RateTable | null = null;
  try {
    const raw = db.getMeta("rates");
    stored = raw ? (JSON.parse(raw) as RateTable) : null;
  } catch {
    stored = null;
  }
  const { table, fresh } = await getRates(stored);
  if (fresh && table) {
    try {
      db.setMeta("rates", JSON.stringify(table));
    } catch {
      // non-fatal
    }
  }
  const result = table ? convertCurrency(q, table.rates) : null;
  if (!result) {
    return {
      kind: "currency",
      input: text,
      heading: `${q.value} ${q.unit}`,
      rows: [],
      note: table ? `No exchange rate for ${q.unit}.` : "Exchange rates are unavailable (offline and nothing cached yet).",
    };
  }
  const when = new Date(table!.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return { ...result, source: `Rates by ExchangeRate-API (open.er-api.com) · updated ${when}` };
});

/* ---- IPC: sentence / paragraph translation ---- */
ipcMain.handle(
  "translate:text",
  async (_event, text: string, from: string): Promise<TextTranslationResult> => {
    const t = (text ?? "").trim();
    if (!t) return { text: "", from, translations: [], truncated: false, error: "Nothing to translate." };
    try {
      return await translateText(t, from || "en");
    } catch (err) {
      return {
        text: t,
        from,
        translations: [],
        truncated: false,
        error: err instanceof Error ? err.message : "Translation failed.",
      };
    }
  }
);

/* ---- IPC: open links in the default browser (allow-listed hosts only) ---- */
const EXTERNAL_HOSTS = ["wikipedia.org", "wikidata.org", "wikimedia.org", "openstreetmap.org"];
ipcMain.handle("app:openExternal", async (_event, url: string): Promise<boolean> => {
  try {
    const u = new URL(url);
    const ok =
      u.protocol === "https:" &&
      EXTERNAL_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    if (!ok) return false;
    await shell.openExternal(u.toString());
    return true;
  } catch {
    return false;
  }
});

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
