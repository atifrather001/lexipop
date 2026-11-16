/* LexiPop - frameless always-on-top popup shown near the cursor */
import { BrowserWindow, ipcMain, screen } from "electron";

const POPUP_W = 560;
const POPUP_H = 480;
/** How far (px) the cursor may stray outside the popup before it auto-hides. */
const LEAVE_MARGIN = 48;
const POLL_MS = 100;
/** Cursor must stay outside this long before hiding (avoids flicker when skimming the edge). */
const LEAVE_DELAY_MS = 400;
/** Destroy the hidden popup window after this long to free its renderer/GPU processes. */
const IDLE_DESTROY_MS = 60_000;

export class PopupWindow {
  private win: BrowserWindow | null = null;
  private watcher: NodeJS.Timeout | null = null;
  private pinned = false;
  private lastInside: boolean | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly preload: string, private readonly baseUrl: string) {}

  private create(): BrowserWindow {
    const win = new BrowserWindow({
      width: POPUP_W,
      height: POPUP_H,
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: "#eef4ee",
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.on("blur", () => { if (!this.pinned) win.hide(); });
    win.on("hide", () => {
      console.log("[popup] hidden");
      this.stopWatching();
      this.pinned = false;
      this.scheduleIdleDestroy();
    });
    win.on("closed", () => { this.stopWatching(); this.win = null; });
    // Pinning is explicit (the pin button in the banner); clicks never pin.
    ipcMain.handle("popup:setPinned", (_e, pinned: boolean) => {
      this.pinned = !!pinned;
      console.log("[popup] pinned =", this.pinned);
      return this.pinned;
    });
    win.webContents.on("before-input-event", (_e, input) => {
      if (input.type === "keyDown" && input.key === "Escape") win.hide();
    });
    win.loadURL(`${this.baseUrl}#popup`);
    this.win = win;
    return win;
  }

  /** Show the popup near the cursor and ask the renderer to look up `word`. */
  async showWord(word: string): Promise<void> {
    const win = this.win ?? this.create();
    const cursor = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(cursor);
    const [w = POPUP_W, h = POPUP_H] = win.getSize();
    const x = Math.min(Math.max(cursor.x + 12, workArea.x), workArea.x + workArea.width - w);
    const y = Math.min(Math.max(cursor.y + 16, workArea.y), workArea.y + workArea.height - h);
    win.setPosition(Math.round(x), Math.round(y));

    const send = () => win.webContents.send("popup:word", word);
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", send);
    } else {
      send();
    }
    this.pinned = false;
    this.lastInside = null;
    this.cancelIdleDestroy();
    win.webContents.send("popup:pinned", false);
    console.log("[popup] shown; auto-hide watcher starting");
    win.show();
    win.focus();
    this.startWatching();
  }

  /** Auto-hide once the cursor has been outside the popup for a short while (unless pinned). */
  private startWatching(): void {
    this.stopWatching();
    let outsideSince: number | null = null;
    this.watcher = setInterval(() => {
      const win = this.win;
      if (!win || win.isDestroyed() || !win.isVisible()) return;
      if (this.pinned) return;
      const c = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const inside =
        c.x >= b.x - LEAVE_MARGIN && c.x <= b.x + b.width + LEAVE_MARGIN &&
        c.y >= b.y - LEAVE_MARGIN && c.y <= b.y + b.height + LEAVE_MARGIN;
      if (inside !== this.lastInside) {
        console.log(`[popup] cursor=${c.x},${c.y} bounds=${b.x},${b.y},${b.width}x${b.height} inside=${inside}`);
        this.lastInside = inside;
      }
      if (inside) {
        outsideSince = null;
        return;
      }
      if (outsideSince === null) outsideSince = Date.now();
      if (Date.now() - outsideSince >= LEAVE_DELAY_MS) {
        console.log("[popup] cursor left; hiding");
        win.hide();
      }
    }, POLL_MS);
  }

  private scheduleIdleDestroy(): void {
    this.cancelIdleDestroy();
    this.idleTimer = setTimeout(() => {
      if (this.win && !this.win.isDestroyed() && !this.win.isVisible()) {
        console.log("[popup] idle; releasing window");
        this.destroy();
      }
    }, IDLE_DESTROY_MS);
  }

  private cancelIdleDestroy(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private stopWatching(): void {
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = null;
  }

  hide(): void {
    this.pinned = false;
    this.win?.hide();
  }

  destroy(): void {
    this.cancelIdleDestroy();
    this.stopWatching();
    try { ipcMain.removeHandler("popup:setPinned"); } catch { /* ignore */ }
    this.win?.destroy();
    this.win = null;
  }
}
