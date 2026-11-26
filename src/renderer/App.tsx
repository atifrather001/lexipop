/* LexiPop - main renderer app (classic compact dictionary layout) */
import { useCallback, useEffect, useRef, useState } from "react";
import { SearchBox } from "./components/SearchBox";
import { Banner } from "./components/Banner";
import { ResultPane } from "./components/ResultPane";
import { ConversionPane } from "./components/ConversionPane";
import { TextTranslationPane } from "./components/TextTranslationPane";
import { HistoryPanel } from "./components/HistoryPanel";
import { AboutDialog } from "./components/AboutDialog";
import { useLookup } from "./hooks/useLookup";
import { parseQuantity, type ConversionResult } from "../shared/convert";
import { hasArabicScript, isRunningText, resolveLang } from "../shared/textkind";
import type { FavoriteItem, TextTranslationResult } from "./shared/types";

const LANGS = [
  { code: "auto", label: "Auto" },
  { code: "en", label: "English" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
];

const IS_POPUP = typeof window !== "undefined" && window.location.hash === "#popup";

type Mode = "word" | "text" | "convert";
interface NavItem {
  text: string;
  lang: string;
}

const api = () => (window as any).lexipop;
const favKey = (word: string, lang: string) => `${word.trim().toLowerCase()}|${lang}`;

function loadBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === "1";
  } catch {
    return def;
  }
}
function saveBool(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    // storage unavailable: ignore
  }
}

export default function App() {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("auto");
  const { result, loading, lookup, clear, entry } = useLookup();
  const [pinned, setPinned] = useState(false);
  // true only for a lookup started by the refresh button
  const [forceEnc, setForceEnc] = useState(false);

  const [mode, setMode] = useState<Mode>("word");
  const [conv, setConv] = useState<ConversionResult | null>(null);
  const [textRes, setTextRes] = useState<TextTranslationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  // back / forward
  const [nav, setNav] = useState<{ items: NavItem[]; index: number }>({ items: [], index: -1 });

  // history / favorites side panel (main window only)
  const [showSide, setShowSide] = useState(() => !IS_POPUP && loadBool("lexipop.sidebar", true));
  const [sideKey, setSideKey] = useState(0);
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set());
  const [showAbout, setShowAbout] = useState(false);
  const closeAbout = useCallback(() => setShowAbout(false), []);

  // "About LexiPop" from the tray menu or Help menu
  useEffect(() => {
    if (IS_POPUP) return;
    return api()?.app?.onAbout?.(() => setShowAbout(true));
  }, []);

  const refreshFavs = useCallback(() => {
    api()
      ?.favorites?.get?.()
      .then((f: FavoriteItem[]) => setFavKeys(new Set((f ?? []).map((x) => favKey(x.word, x.lang)))))
      .catch(() => {});
    setSideKey((k) => k + 1);
  }, []);
  useEffect(() => {
    refreshFavs();
  }, [refreshFavs]);

  /** One entry point for everything: converter, sentence translation, or dictionary. */
  const runQuery = useCallback(
    async (raw: string, l: string, opts: { force?: boolean; fromNav?: boolean } = {}) => {
      const text = raw.trim();
      if (!text) return;
      const id = ++reqId.current;
      setQuery(text);
      setForceEnc(!!opts.force);
      if (!opts.fromNav) {
        setNav((n) => {
          const items = n.items.slice(0, n.index + 1);
          const last = items[items.length - 1];
          if (last && last.text === text && last.lang === l) return n;
          const next = [...items, { text, lang: l }].slice(-100);
          return { items: next, index: next.length - 1 };
        });
      }

      // 1) "$100", "5 miles", "30°F", "3 PM EST"
      if (parseQuantity(text)) {
        setMode("convert");
        clear();
        setTextRes(null);
        setConv(null);
        setBusy(true);
        let r: ConversionResult | null = null;
        try {
          r = (await api()?.convert?.run?.(text)) ?? null;
        } catch {
          r = null;
        }
        if (id !== reqId.current) return;
        setBusy(false);
        if (r) {
          setConv(r);
          return;
        }
        // not convertible after all: fall through
      }

      // 2) sentences and paragraphs
      if (isRunningText(text)) {
        setMode("text");
        clear();
        setConv(null);
        setTextRes(null);
        setBusy(true);
        const from = hasArabicScript(text) ? resolveLang(text, l) : "en";
        let r: TextTranslationResult;
        try {
          r = await api()?.translate?.text?.(text, from);
        } catch (e) {
          r = { text, from, translations: [], truncated: false, error: e instanceof Error ? e.message : "Translation failed." };
        }
        if (id !== reqId.current) return;
        setTextRes(r ?? null);
        setBusy(false);
        return;
      }

      // 3) words and short phrases
      setMode("word");
      setConv(null);
      setTextRes(null);
      setBusy(false);
      // "Auto" (and the popup): Latin -> English, Urdu-only letters -> Urdu, other Arabic script -> Arabic
      await lookup(text, resolveLang(text, l), !!opts.force);
      if (id === reqId.current) setSideKey((k) => k + 1);
    },
    [lookup, clear]
  );

  // Popup mode: the main process pushes the captured text and resets the pin
  useEffect(() => {
    if (!IS_POPUP) return;
    const a = api();
    if (!a?.popup?.onWord) return;
    const offWord = a.popup.onWord((word: string) => void runQuery(word, "auto"));
    const offPin = a.popup.onPinned?.((p: boolean) => setPinned(p));
    // Listeners are attached; now ask for any word that arrived before we mounted
    a.popup.ready?.().then((word: string | null) => {
      if (word) void runQuery(word, "auto");
    });
    return () => {
      offWord?.();
      offPin?.();
    };
  }, [runQuery]);

  const go = useCallback(
    (delta: number) => {
      const i = nav.index + delta;
      const it = nav.items[i];
      if (!it) return;
      setNav({ items: nav.items, index: i });
      setLang(it.lang);
      void runQuery(it.text, it.lang, { fromNav: true });
    },
    [nav, runQuery]
  );

  // Alt+Left / Alt+Right, plus the mouse back/forward buttons
  useEffect(() => {
    if (IS_POPUP) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) go(-1);
      if (e.button === 4) go(1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
  }, [go]);

  const togglePin = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    api()?.popup?.setPinned?.(next);
  }, [pinned]);

  const toggleSide = useCallback(() => {
    setShowSide((s) => {
      saveBool("lexipop.sidebar", !s);
      return !s;
    });
  }, []);

  const handleLookup = useCallback(
    (v: string) => {
      if (!v) return;
      void runQuery(v, lang);
    },
    [runQuery, lang]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setConv(null);
    setTextRes(null);
    setMode("word");
    clear();
  }, [clear]);

  const isFav = !!entry && favKeys.has(favKey(entry.word, entry.language));
  const toggleFavorite = useCallback(async () => {
    if (!entry) return;
    const a = api();
    if (isFav) await a?.favorites?.remove?.(entry.word, entry.language);
    else await a?.favorites?.add?.(entry.word, entry.language, []);
    refreshFavs();
  }, [entry, isFav, refreshFavs]);

  const working = loading || busy;
  const hasContent =
    (mode === "word" && (!!entry || !!result.error)) ||
    (mode === "convert" && !!conv) ||
    (mode === "text" && !!textRes);

  const statusSources =
    mode === "convert" ? (conv?.kind === "currency" ? "ExchangeRate-API" : "LexiPop converter")
    : mode === "text" ? (textRes ? "MyMemory" : "")
    : entry ? entry.sources.join(", ") : "";

  return (
    <div className="flex flex-col h-full">
      {/* Banner */}
      <div className={IS_POPUP ? "drag-region" : ""}>
        <Banner
          compact={IS_POPUP}
          onClose={IS_POPUP ? () => window.close() : undefined}
          pinned={pinned}
          onTogglePin={IS_POPUP ? togglePin : undefined}
        />
      </div>

      {/* Toolbar */}
      <header className={`bx-toolbar ${IS_POPUP ? "drag-region" : ""}`}>
        {IS_POPUP ? (
          <div className="w-6 h-6 rounded bg-white/90 text-green-800 text-[13px] font-bold flex items-center justify-center shrink-0">
            L
          </div>
        ) : (
          <>
            <button
              type="button"
              className={`bx-icon-btn text-white hover:bg-white/20 ${showSide ? "bg-white/20" : ""}`}
              onClick={toggleSide}
              title="History & favorites"
            >
              &#9776;
            </button>
            <button
              type="button"
              className="bx-icon-btn text-white hover:bg-white/20 disabled:opacity-40"
              onClick={() => go(-1)}
              disabled={nav.index <= 0}
              title="Back (Alt+Left)"
            >
              &#9664;
            </button>
            <button
              type="button"
              className="bx-icon-btn text-white hover:bg-white/20 disabled:opacity-40"
              onClick={() => go(1)}
              disabled={nav.index >= nav.items.length - 1}
              title="Forward (Alt+Right)"
            >
              &#9654;
            </button>
          </>
        )}
        <div className="flex-1 min-w-0">
          <SearchBox
            value={query}
            onChange={setQuery}
            onLookup={handleLookup}
            loading={working}
            placeholder="Word, sentence, $100, 5 miles, 3 PM EST…"
          />
        </div>
        <select className="bx-select" value={lang} onChange={(e) => setLang(e.target.value)} title="Source language">
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button type="button" className="bx-btn" onClick={() => handleLookup(query.trim())} disabled={working || !query.trim()}>
          Look up
        </button>
        {!IS_POPUP && (
          <button type="button" className="bx-icon-btn text-white hover:bg-white/20" onClick={handleClear} title="Clear">
            &#10005;
          </button>
        )}
        {!IS_POPUP && (
          <button
            type="button"
            className="bx-icon-btn text-white hover:bg-white/20 font-semibold"
            onClick={() => setShowAbout(true)}
            title="About LexiPop"
            aria-label="About LexiPop"
          >
            &#9432;
          </button>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {showSide && !IS_POPUP && (
          <HistoryPanel
            refreshKey={sideKey}
            onPick={(w, l) => {
              setLang(l);
              void runQuery(w, l);
            }}
            onFavoritesChanged={refreshFavs}
          />
        )}

        <main className="flex-1 min-w-0 overflow-y-auto p-3">
          {mode === "word" && result.error && !entry && (
            <div className="bx-section">
              <div className="bx-section-head" style={{ background: "#fde8e8", color: "#991b1b" }}>Lookup error</div>
              <div className="bx-section-body text-red-800">{result.error}</div>
            </div>
          )}

          {!hasContent && !working && (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
              <div className="text-3xl mb-2">&#128214;</div>
              <div className="text-[14px] font-medium text-slate-600">Type a word and press Enter</div>
              <div className="text-[12px] mt-1">
                Sentences are translated, and things like <span className="font-mono text-green-800">$100</span>,{" "}
                <span className="font-mono text-green-800">5 miles</span> or{" "}
                <span className="font-mono text-green-800">3 PM EST</span> are converted
              </div>
              <div className="text-[12px] mt-1">
                Press <span className="font-mono text-green-800">/</span> to jump to the search box
              </div>
            </div>
          )}

          {mode === "convert" && conv && <ConversionPane result={conv} />}

          {mode === "text" && textRes && <TextTranslationPane result={textRes} />}

          {mode === "word" && entry && (
            <ResultPane
              entry={entry}
              warnings={result.warnings}
              forceEncyclopedia={forceEnc}
              isFavorite={isFav}
              onToggleFavorite={toggleFavorite}
              onRefresh={() => void runQuery(entry.word, entry.language, { force: true, fromNav: true })}
            />
          )}

          {working && !hasContent && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500">
              <div className="animate-spin text-2xl mb-2">&#9881;</div>
              <div className="text-[12px]">
                {mode === "text" ? "Translating…" : mode === "convert" ? "Converting…" : "Looking up…"}
              </div>
            </div>
          )}
        </main>
      </div>

      {showAbout && <AboutDialog onClose={closeAbout} />}

      {/* Status bar */}
      <footer className="bx-statusbar">
        <span>LexiPop</span>
        {statusSources && (
          <>
            <span>&middot;</span>
            <span className="truncate">{statusSources}</span>
          </>
        )}
        {mode === "word" && entry && <span className="ml-auto">{entry.fromCache ? "from cache" : "live"}</span>}
      </footer>
    </div>
  );
}
