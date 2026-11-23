/* LexiPop - Encyclopedia section (Wikipedia summary, Wikidata country facts, OpenStreetMap) */
import { useEffect, useState, type ReactNode } from "react";
import { Section } from "./Section";
import type { EncyclopediaEntry, EncyclopediaResult } from "../shared/types";

const IS_POPUP = typeof window !== "undefined" && window.location.hash === "#popup";

interface EncyclopediaSectionProps {
  term: string;
  lang: string;
  /** Bypass the cache (user pressed refresh). */
  force?: boolean;
  /** Open by default (e.g. when the dictionary found nothing). */
  open?: boolean;
}

function openExternal(url: string): void {
  (window as any).lexipop?.app?.openExternal?.(url);
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
      className="text-green-800 hover:underline"
    >
      {children}
    </a>
  );
}

/** Map box around a point; roughly sized to a country's area when known. */
function mapEmbedUrl(lat: number, lon: number, areaKm2?: number): string {
  const d = areaKm2 ? Math.min(20, Math.max(0.5, Math.sqrt(areaKm2) / 111)) : 0.15;
  const bbox = [lon - d * 1.4, lat - d, lon + d * 1.4, lat + d].map((n) => n.toFixed(4)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

function osmLink(lat: number, lon: number, zoom: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

function FactRow({ label, values }: { label: string; values: Array<string | undefined> }) {
  const v = values.filter(Boolean).join(", ");
  if (!v) return null;
  return (
    <tr>
      <td className="pr-3 py-0.5 text-slate-500 whitespace-nowrap align-top">{label}</td>
      <td className="py-0.5 text-slate-800" dir="auto">{v}</td>
    </tr>
  );
}

export function EncyclopediaSection({ term, lang, force = false, open }: EncyclopediaSectionProps) {
  const [entry, setEntry] = useState<EncyclopediaEntry | null>(null);
  const [expanded, setExpanded] = useState(!IS_POPUP);
  // the popup is small: its map loads only when asked for
  const [showMap, setShowMap] = useState(!IS_POPUP);

  useEffect(() => {
    let cancelled = false;
    setEntry(null);
    const api = (window as any).lexipop;
    if (!api?.encyclopedia?.lookup || !term.trim()) return;
    api.encyclopedia
      .lookup(term, lang, force)
      .then((res: EncyclopediaResult) => {
        if (!cancelled) setEntry(res.entry);
      })
      .catch(() => {
        /* encyclopedia is optional; stay silent */
      });
    return () => {
      cancelled = true;
    };
  }, [term, lang, force]);

  if (!entry) return null;
  const c = entry.country;
  const nf = new Intl.NumberFormat();
  const coords = entry.coordinates;
  const isRtl = entry.wikiLang === "ur" || entry.wikiLang === "ar" || entry.wikiLang === "fa";

  return (
    <Section
      title="Encyclopedia"
      subtitle={entry.description || `Wikipedia (${entry.wikiLang})`}
      defaultOpen={open ?? !!c}
    >
      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-slate-900" dir="auto">{entry.title}</div>
          <p
            dir={isRtl ? "rtl" : "auto"}
            className={`mt-1 text-slate-700 whitespace-pre-line leading-relaxed ${expanded ? "" : "line-clamp-3"}`}
          >
            {entry.extract}
          </p>
          {!expanded && (
            <button type="button" className="text-[12px] text-green-800 hover:underline" onClick={() => setExpanded(true)}>
              more…
            </button>
          )}
        </div>
        {(c?.flagUrl || entry.thumbnail) && (
          <img
            src={c?.flagUrl ?? entry.thumbnail}
            alt=""
            className={`shrink-0 rounded border border-slate-200 object-cover ${c?.flagUrl ? "w-[90px]" : "w-[110px] max-h-[140px]"}`}
            loading="lazy"
          />
        )}
      </div>

      {c && (
        <table className="mt-3 text-[13px]">
          <tbody>
            <FactRow label="Capital" values={c.capital} />
            <FactRow label="Continent" values={c.continent} />
            <FactRow label="Population" values={[c.population ? nf.format(c.population) : undefined]} />
            <FactRow label="Area" values={[c.areaKm2 ? `${nf.format(Math.round(c.areaKm2))} km²` : undefined]} />
            <FactRow label="Currency" values={c.currencies} />
            <FactRow label="Languages" values={c.languages} />
            <FactRow label="ISO code" values={[c.iso2]} />
          </tbody>
        </table>
      )}

      {coords && showMap && (
        <iframe
          title={`Map of ${entry.title}`}
          src={mapEmbedUrl(coords.lat, coords.lon, c?.areaKm2)}
          className={`mt-3 w-full rounded border border-slate-200 ${IS_POPUP ? "h-[180px]" : "h-[240px]"}`}
          loading="lazy"
        />
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <ExtLink href={entry.pageUrl}>Read full article ↗</ExtLink>
        {coords && IS_POPUP && (
          <button type="button" className="text-green-800 hover:underline" onClick={() => setShowMap((m) => !m)}>
            {showMap ? "Hide map" : "Show map"}
          </button>
        )}
        {coords && <ExtLink href={osmLink(coords.lat, coords.lon, c ? 5 : 11)}>Open map ↗</ExtLink>}
        <span className="ml-auto">
          Source: Wikipedia (CC BY-SA){c ? " · Wikidata" : ""}
          {coords && showMap ? " · © OpenStreetMap contributors" : ""}
          {entry.fromCache ? " · cached" : ""}
        </span>
      </div>
    </Section>
  );
}
