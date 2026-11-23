/* LexiPop - preload script. Exposes a narrow IPC API to the renderer. */
// Inline import type keeps this file a plain script (no ESM import/export),
// which is required for Electron's sandboxed preload.
type WordEntry = import("../shared/types").WordEntry;
type EncyclopediaResult = import("../shared/types").EncyclopediaResult;
type TextTranslationResult = import("../shared/types").TextTranslationResult;
type ConversionResult = import("../shared/convert").ConversionResult;

const { contextBridge, ipcRenderer } = require("electron");

interface LookupResult {
  entry: WordEntry | null;
  error: string | null;
  warnings: string[];
}

interface HistoryItem {
  id: number;
  word: string;
  lang: string;
  lookedUpAt: number;
}

interface FavoriteItem {
  id: number;
  word: string;
  lang: string;
  tags: string[];
  addedAt: number;
}

const api = {
  lookup: (word: string, lang: string, force = false): Promise<LookupResult> =>
    ipcRenderer.invoke("dictionary:lookup", word, lang, force),
  encyclopedia: {
    lookup: (term: string, lang: string, force = false): Promise<EncyclopediaResult> =>
      ipcRenderer.invoke("encyclopedia:lookup", term, lang, force),
  },
  convert: {
    /** Currency / unit / temperature / time-zone conversion; null when the text isn't a quantity. */
    run: (text: string): Promise<ConversionResult | null> => ipcRenderer.invoke("convert:run", text),
  },
  translate: {
    /** Full-text translation (English -> Urdu + Arabic, or Urdu/Arabic/Persian -> English). */
    text: (text: string, from: string): Promise<TextTranslationResult> =>
      ipcRenderer.invoke("translate:text", text, from),
  },
  history: {
    get: (limit?: number): Promise<HistoryItem[]> =>
      ipcRenderer.invoke("history:get", limit ?? 100),
    clear: (): Promise<void> => ipcRenderer.invoke("history:clear"),
  },
  favorites: {
    get: (): Promise<FavoriteItem[]> =>
      ipcRenderer.invoke("favorites:get"),
    add: (word: string, lang: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("favorites:add", word, lang, tags),
    remove: (word: string, lang: string): Promise<void> =>
      ipcRenderer.invoke("favorites:remove", word, lang),
    updateTags: (word: string, lang: string, tags: string[]): Promise<void> =>
      ipcRenderer.invoke("favorites:updateTags", word, lang, tags),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
    getPlatform: (): Promise<string> => ipcRenderer.invoke("app:getPlatform"),
    /** Fired when "About LexiPop" is chosen from the tray or the Help menu. */
    onAbout: (cb: () => void): (() => void) => {
      const handler = () => cb();
      ipcRenderer.on("app:about", handler);
      return () => ipcRenderer.removeListener("app:about", handler);
    },
    /** Opens Wikipedia / Wikidata / OpenStreetMap links in the default browser. */
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("app:openExternal", url),
  },
  popup: {
    /** Fired when the main process wants the popup to look up a word. */
    onWord: (cb: (word: string) => void): (() => void) => {
      const handler = (_e: unknown, word: string) => cb(word);
      ipcRenderer.on("popup:word", handler);
      return () => ipcRenderer.removeListener("popup:word", handler);
    },
    /** Handshake: tell main the popup UI is mounted; returns the word to show (or null). */
    ready: (): Promise<string | null> => ipcRenderer.invoke("popup:ready"),
    /** Keep the popup open even when the mouse leaves. */
    setPinned: (pinned: boolean): Promise<boolean> => ipcRenderer.invoke("popup:setPinned", pinned),
    /** Main process resets the pin on every show. */
    onPinned: (cb: (pinned: boolean) => void): (() => void) => {
      const handler = (_e: unknown, p: boolean) => cb(p);
      ipcRenderer.on("popup:pinned", handler);
      return () => ipcRenderer.removeListener("popup:pinned", handler);
    },
  },
} as const;

try {
  contextBridge.exposeInMainWorld("lexipop", api);
} catch {
  // contextBridge unavailable (e.g. contextIsolation disabled) — fall back
  // to exposing the same API on the global object.
  (globalThis as any).lexipop = api;
}
