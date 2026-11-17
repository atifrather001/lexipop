/* LexiPop - main renderer app (classic compact dictionary layout) */
import { useCallback, useEffect, useState } from "react";
import { SearchBox } from "./components/SearchBox";
import { Banner } from "./components/Banner";
import { ResultPane } from "./components/ResultPane";
import { useLookup } from "./hooks/useLookup";

const LANGS = [
  { code: "en", label: "English" },
  { code: "ur", label: "Urdu" },
  { code: "ar", label: "Arabic" },
];

const IS_POPUP = typeof window !== "undefined" && window.location.hash === "#popup";

export default function App() {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("en");
  const { result, loading, lookup, clear, entry } = useLookup();
  const [pinned, setPinned] = useState(false);

  // Popup mode: the main process pushes the captured word and resets the pin
  useEffect(() => {
    if (!IS_POPUP) return;
    const api = (window as any).lexipop;
    if (!api?.popup?.onWord) return;
    const offWord = api.popup.onWord((word: string) => {
      setQuery(word);
      lookup(word, "en");
    });
    const offPin = api.popup.onPinned?.((p: boolean) => setPinned(p));
    // Listeners are attached; now ask for any word that arrived before we mounted
    api.popup.ready?.().then((word: string | null) => {
      if (word) {
        setQuery(word);
        lookup(word, "en");
      }
    });
    return () => { offWord?.(); offPin?.(); };
  }, [lookup]);

  const togglePin = useCallback(() => {
    const api = (window as any).lexipop;
    const next = !pinned;
    setPinned(next);
    api?.popup?.setPinned?.(next);
  }, [pinned]);

  const handleLookup = useCallback(
    (v: string) => {
      if (!v) return;
      lookup(v, lang);
    },
    [lookup, lang]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    clear();
  }, [clear]);

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
        <div className="w-6 h-6 rounded bg-white/90 text-green-800 text-[13px] font-bold flex items-center justify-center shrink-0">
          L
        </div>
        <div className="flex-1 min-w-0">
          <SearchBox value={query} onChange={setQuery} onLookup={handleLookup} loading={loading} />
        </div>
        <select
          className="bx-select"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          title="Source language"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <button type="button" className="bx-btn" onClick={() => handleLookup(query.trim())} disabled={loading || !query.trim()}>
          Look up
        </button>
        {!IS_POPUP && (
          <button type="button" className="bx-icon-btn text-white hover:bg-white/20" onClick={handleClear} title="Clear">
            &#10005;
          </button>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 min-h-0 overflow-y-auto p-3">
        {result.error && !entry && (
          <div className="bx-section">
            <div className="bx-section-head" style={{ background: "#fde8e8", color: "#991b1b" }}>Lookup error</div>
            <div className="bx-section-body text-red-800">{result.error}</div>
          </div>
        )}

        {!result.error && !entry && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
            <div className="text-3xl mb-2">&#128214;</div>
            <div className="text-[14px] font-medium text-slate-600">Type a word and press Enter</div>
            <div className="text-[12px] mt-1">
              Press <span className="font-mono text-green-800">/</span> to jump to the search box
            </div>
          </div>
        )}

        {entry && (
          <ResultPane
            entry={entry}
            warnings={result.warnings}
            onRefresh={() => lookup(entry.word, entry.language, true)}
          />
        )}

        {loading && !entry && (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <div className="animate-spin text-2xl mb-2">&#9881;</div>
            <div className="text-[12px]">{"Looking up…"}</div>
          </div>
        )}
      </main>

      {/* Status bar */}
      <footer className="bx-statusbar">
        <span>LexiPop</span>
        {entry && (
          <>
            <span>&middot;</span>
            <span>{entry.sources.join(", ")}</span>
            <span className="ml-auto">{entry.fromCache ? "from cache" : "live"}</span>
          </>
        )}
      </footer>
    </div>
  );
}
