/* LexiPop - Phonetic + audio chips */
import type { Phonetic } from "../shared/types";
import { playPronunciation, speakWord } from "../lib/speech";

interface PhoneticBarProps {
  phonetics: Phonetic[];
  word: string;
  lang: string;
}

export function PhoneticBar({ phonetics, word, lang }: PhoneticBarProps) {
  const hasClip = phonetics.some((p) => !!p.audio);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {phonetics.map((p, i) => (
        <span key={i} className="bx-chip" title={p.source}>
          <span className="font-mono text-slate-700">{p.text}</span>
          {p.audio && (
            <button
              type="button"
              onClick={() => playPronunciation(p.audio, word, lang)}
              className="text-slate-500 hover:text-green-800"
              title={`Play pronunciation (${p.source})`}
              aria-label={`Play pronunciation from ${p.source}`}
            >
              &#128266;
            </button>
          )}
        </span>
      ))}
      {!hasClip && (
        <button
          type="button"
          onClick={() => speakWord(word, lang)}
          className="bx-chip text-slate-600 hover:text-green-800"
          title="Speak with system voice"
        >
          &#128266; Speak
        </button>
      )}
    </div>
  );
}
