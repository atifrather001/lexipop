/* LexiPop - sentence / paragraph translation */
import { Section } from "./Section";
import { CopyButton } from "./CopyButton";
import { speakWord } from "../lib/speech";
import type { TextTranslationResult } from "../shared/types";

const LANG: Record<string, { name: string; rtl: boolean; font: string }> = {
  en: { name: "English", rtl: false, font: "" },
  ur: { name: "Urdu", rtl: true, font: "font-urdu" },
  ar: { name: "Arabic", rtl: true, font: "font-arabic" },
  fa: { name: "Persian", rtl: true, font: "font-arabic" },
};
const meta = (code: string) => LANG[code] ?? { name: code.toUpperCase(), rtl: false, font: "" };

function SpeakButton({ text, lang }: { text: string; lang: string }) {
  return (
    <button
      type="button"
      className="text-[12px] text-slate-400 hover:text-green-800"
      title={`Speak (${meta(lang).name})`}
      onClick={() => {
        if (!speakWord(text, lang)) {
          window.alert(`No ${meta(lang).name} voice is installed on this PC, so LexiPop can't read it aloud.`);
        }
      }}
    >
      &#128266; speak
    </button>
  );
}

export function TextTranslationPane({ result }: { result: TextTranslationResult }) {
  const src = meta(result.from);
  return (
    <div>
      <Section title="Original" subtitle={src.name}>
        <p dir={src.rtl ? "rtl" : "auto"} className={`text-slate-800 whitespace-pre-line ${src.rtl ? `text-[18px] ${src.font}` : ""}`}>
          {result.text}
        </p>
        <div className="mt-1 flex gap-3">
          <SpeakButton text={result.text} lang={result.from} />
          <CopyButton text={result.text} />
        </div>
        {result.truncated && (
          <div className="mt-1 text-[11.5px] text-amber-800">Long selection: only the first part was translated.</div>
        )}
      </Section>

      {result.error && (
        <div className="bx-section">
          <div className="bx-section-head" style={{ background: "#fde8e8", color: "#991b1b" }}>Translation error</div>
          <div className="bx-section-body text-red-800">{result.error}</div>
        </div>
      )}

      {result.translations.map((t) => {
        const m = meta(t.lang);
        return (
          <Section key={t.lang} title={m.name} subtitle="MyMemory">
            <p
              dir={m.rtl ? "rtl" : "ltr"}
              lang={t.lang}
              className={`text-slate-900 whitespace-pre-line ${m.rtl ? `text-[20px] ${m.font}` : "text-[14px]"}`}
            >
              {t.text}
            </p>
            <div className="mt-1 flex gap-3">
              <SpeakButton text={t.text} lang={t.lang} />
              <CopyButton text={t.text} />
            </div>
          </Section>
        );
      })}
    </div>
  );
}
