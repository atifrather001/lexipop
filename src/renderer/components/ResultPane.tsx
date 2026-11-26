/* LexiPop - Results (glossary-style sections grouped by source) */
import { PhoneticBar } from "./PhoneticBar";
import { DefinitionList } from "./DefinitionList";
import { SynonymAntonymList } from "./SynonymAntonymList";
import { TranslationList } from "./TranslationList";
import { Section } from "./Section";
import { EncyclopediaSection } from "./EncyclopediaSection";
import type { WordEntry, Definition } from "../shared/types";

interface ResultPaneProps {
  entry: WordEntry | null;
  warnings: string[];
  onRefresh?: () => void;
  /** Refetch the encyclopedia section instead of using its cache. */
  forceEncyclopedia?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

function groupBySource(defs: Definition[]): Array<[string, Definition[]]> {
  const map = new Map<string, Definition[]>();
  for (const d of defs) {
    const k = d.source || "Dictionary";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return [...map.entries()];
}

export function ResultPane({
  entry,
  warnings,
  onRefresh,
  forceEncyclopedia = false,
  isFavorite = false,
  onToggleFavorite,
}: ResultPaneProps) {
  if (!entry) return null;
  const groups = groupBySource(entry.definitions);
  const hasTranslations = Object.values(entry.translations).some((t: string[]) => t.length > 0);
  const hasSynAnt = entry.synonyms.length > 0 || entry.antonyms.length > 0;

  return (
    <div>
      {warnings.length > 0 && (
        <div className="mb-2 px-3 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-900 text-[12px]">
          {warnings.map((w, i) => (
            <div key={i}>{"⚠ "}{w}</div>
          ))}
        </div>
      )}

      {/* Headword */}
      <div className="bx-section">
        <div className="bx-section-body">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[24px] font-bold text-slate-900 leading-tight">{entry.word}</h1>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={onToggleFavorite}
                className={`text-[20px] leading-none ${isFavorite ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}`}
                title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={isFavorite}
              >
                {isFavorite ? "★" : "☆"}
              </button>
            )}
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{entry.language}</span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="ml-auto text-[12px] text-slate-500 hover:text-green-800"
                title={entry.fromCache ? "Cached result — click to fetch fresh data" : "Fetch fresh data"}
              >
                &#8635; {entry.fromCache ? "cached" : "refresh"}
              </button>
            )}
          </div>
          <div className="mt-2">
            <PhoneticBar phonetics={entry.phonetics} word={entry.word} lang={entry.language} />
          </div>
        </div>
      </div>

      {hasTranslations && (
        <Section
          title="Translations"
          subtitle={Object.keys(entry.translations)
            .filter((c) => entry.translations[c]?.length)
            .map((c) => ({ en: "English", ur: "Urdu", ar: "Arabic", fa: "Persian" } as Record<string, string>)[c] ?? c.toUpperCase())
            .join(" · ")}
          defaultOpen={entry.language !== "en"}
        >
          <TranslationList translations={entry.translations} />
        </Section>
      )}

      <EncyclopediaSection
        term={entry.word}
        lang={entry.language}
        force={forceEncyclopedia}
        open={groups.length === 0 ? true : undefined}
      />

      {groups.map(([source, defs]) => (
        <Section key={source} title={source} subtitle="definitions" count={defs.length}>
          <DefinitionList definitions={defs} />
        </Section>
      ))}
      {groups.length === 0 && (
        <Section title="Definitions">
          <p className="text-slate-500 italic">No definitions found.</p>
        </Section>
      )}

      {hasSynAnt && (
        <Section title="Synonyms & Antonyms" subtitle="Datamuse" count={entry.synonyms.length + entry.antonyms.length}>
          <SynonymAntonymList synonyms={entry.synonyms} antonyms={entry.antonyms} />
        </Section>
      )}

      {entry.examples.length > 0 && (
        <Section title="Examples" count={entry.examples.length} defaultOpen={false}>
          <ol className="list-decimal pl-5 space-y-1">
            {entry.examples.map((ex, i) => (
              <li key={i} className="text-slate-700">{"“"}{ex}{"”"}</li>
            ))}
          </ol>
        </Section>
      )}

      {entry.etymology && (
        <Section title="Etymology" subtitle="Wiktionary" defaultOpen={false}>
          <p className="text-slate-700 whitespace-pre-line">{entry.etymology}</p>
        </Section>
      )}
    </div>
  );
}
