/* LexiPop - side panel: recent lookups and favorites */
import { useEffect, useState } from "react";
import type { FavoriteItem, HistoryItem } from "../shared/types";

interface HistoryPanelProps {
  /** Bump to reload (after a lookup or a favorite change). */
  refreshKey: number;
  onPick: (word: string, lang: string) => void;
  onFavoritesChanged: () => void;
}

type Tab = "recent" | "favorites";

function when(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HistoryPanel({ refreshKey, onPick, onFavoritesChanged }: HistoryPanelProps) {
  const [tab, setTab] = useState<Tab>("recent");
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [favs, setFavs] = useState<FavoriteItem[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const api = (window as any).lexipop;
    api?.history?.get?.(200).then((r: HistoryItem[]) => setRecent(r ?? [])).catch(() => setRecent([]));
    api?.favorites?.get?.().then((f: FavoriteItem[]) => setFavs(f ?? [])).catch(() => setFavs([]));
  }, [refreshKey]);

  const f = filter.trim().toLowerCase();
  const rows: Array<{ word: string; lang: string; at: number }> =
    tab === "recent"
      ? recent.map((r) => ({ word: r.word, lang: r.lang, at: r.lookedUpAt }))
      : favs.map((r) => ({ word: r.word, lang: r.lang, at: r.addedAt }));
  const shown = f ? rows.filter((r) => r.word.toLowerCase().includes(f)) : rows;

  return (
    <aside className="w-[220px] shrink-0 flex flex-col border-r bg-white" style={{ borderColor: "var(--bx-border)" }}>
      <div className="flex text-[12.5px] font-semibold border-b" style={{ borderColor: "var(--bx-border)" }}>
        {(["recent", "favorites"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 ${tab === t ? "bx-section-head justify-center cursor-default" : "text-slate-500 hover:bg-slate-50"}`}
          >
            {t === "recent" ? "Recent" : `★ Favorites${favs.length ? ` (${favs.length})` : ""}`}
          </button>
        ))}
      </div>
      <div className="p-2 border-b" style={{ borderColor: "var(--bx-border)" }}>
        <input
          className="bx-input !py-1 !text-[12.5px]"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto text-[13px]">
        {shown.length === 0 && (
          <li className="px-3 py-4 text-slate-400 italic text-center">
            {tab === "recent" ? "No lookups yet" : "No favorites yet — click ☆ next to a word"}
          </li>
        )}
        {shown.map((r) => (
          <li key={`${r.word}|${r.lang}`} className="group flex items-center gap-1 px-3 py-1 hover:bg-green-50">
            <button type="button" className="flex-1 min-w-0 text-left truncate" dir="auto" onClick={() => onPick(r.word, r.lang)} title={r.word}>
              {r.word}
              {r.lang !== "en" && <span className="ml-1 text-[10px] uppercase text-slate-400">{r.lang}</span>}
            </button>
            {tab === "favorites" ? (
              <button
                type="button"
                className="text-slate-300 hover:text-red-700 opacity-0 group-hover:opacity-100"
                title="Remove from favorites"
                onClick={async () => {
                  await (window as any).lexipop?.favorites?.remove?.(r.word, r.lang);
                  onFavoritesChanged();
                }}
              >
                &#10005;
              </button>
            ) : (
              <span className="text-[10.5px] text-slate-400 shrink-0">{when(r.at)}</span>
            )}
          </li>
        ))}
      </ul>
      {tab === "recent" && recent.length > 0 && (
        <button
          type="button"
          className="m-2 text-[11.5px] text-slate-500 hover:text-red-700"
          onClick={async () => {
            if (!window.confirm("Clear all lookup history?")) return;
            await (window as any).lexipop?.history?.clear?.();
            setRecent([]);
          }}
        >
          Clear history
        </button>
      )}
    </aside>
  );
}
