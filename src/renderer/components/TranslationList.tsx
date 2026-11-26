/* LexiPop - Translations (RTL-aware), shown inline in the main view */
import { speakWord } from "../lib/speech";

interface TranslationListProps {
  translations: Record<string, string[]>;
}

const LANG_META: Record<string, { name: string; rtl: boolean; fontClass: string }> = {
  en: { name: "English", rtl: false, fontClass: "" },
  ur: { name: "Urdu", rtl: true, fontClass: "font-urdu" },
  ar: { name: "Arabic", rtl: true, fontClass: "font-arabic" },
  fa: { name: "Persian", rtl: true, fontClass: "font-arabic" },
};

/** Split "term (translit) — gloss" into parts. */
function parseLine(line: string): { term: string; translit?: string; gloss?: string } {
  const [head, gloss] = line.split(" — ");
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(head ?? "");
  if (m) return { term: m[1] ?? "", translit: m[2], gloss };
  return { term: head ?? "", gloss };
}

export function TranslationList({ translations }: TranslationListProps) {
  const codes = Object.keys(translations).filter((c) => translations[c]?.length);
  if (!codes.length) return null;

  return (
    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {codes.map((code) => {
        const meta = LANG_META[code] ?? { name: code.toUpperCase(), rtl: false, fontClass: "" };
        return (
          <div key={code}>
            <div className="text-[12px] font-semibold text-slate-500 mb-1 border-b border-slate-200 pb-0.5">{meta.name}</div>
            <ul className="space-y-1">
              {translations[code]!.map((line, i) => {
                const { term, translit, gloss } = parseLine(line);
                return (
                  <li key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!speakWord(term, code)) {
                          window.alert(`No ${meta.name} voice is installed on this PC, so LexiPop can't pronounce it offline.`);
                        }
                      }}
                      className="text-slate-400 hover:text-green-800 shrink-0"
                      title={`Speak (${meta.name})`}
                    >
                      &#128266;
                    </button>
                    <span dir={meta.rtl ? "rtl" : "ltr"} lang={code} className={`text-[20px] text-slate-900 ${meta.fontClass}`}>
                      {term}
                    </span>
                    {translit && <span className="text-[12px] text-slate-500 font-mono">{translit}</span>}
                    {gloss && <span className="ml-auto text-[11.5px] text-slate-400 italic truncate">{gloss}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
