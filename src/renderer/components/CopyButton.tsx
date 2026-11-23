/* LexiPop - small "copy to clipboard" button */
import { useState } from "react";

export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`text-[12px] text-slate-400 hover:text-green-800 shrink-0 ${className}`}
      title="Copy"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          })
          .catch(() => {});
      }}
    >
      {done ? "✓ copied" : "⧉ copy"}
    </button>
  );
}
