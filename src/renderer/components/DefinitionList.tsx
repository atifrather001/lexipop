/* LexiPop - Definitions list (numbered, classic dictionary style) */
import type { Definition } from "../shared/types";

interface DefinitionListProps {
  definitions: Definition[];
}

export function DefinitionList({ definitions }: DefinitionListProps) {
  if (!definitions.length) {
    return <p className="text-slate-500 italic">No definitions found.</p>;
  }

  const copyDef = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

  return (
    <ol className="space-y-2.5">
      {definitions.map((def, i) => (
        <li key={i} className="flex gap-2 group">
          <span className="w-5 shrink-0 text-right text-slate-400 tabular-nums">{i + 1}.</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] text-slate-800">
              <span className="bx-pos">{def.partOfSpeech || "n/a"}</span>
              {def.definition}
              <button
                type="button"
                onClick={() => copyDef(def.definition)}
                className="ml-2 text-[11px] text-green-800 opacity-0 group-hover:opacity-100 hover:underline"
                title="Copy definition"
              >
                copy
              </button>
            </div>
            {def.example && (
              <div className="mt-0.5 text-[12.5px] text-slate-500 italic">
                {"“"}{def.example}{"”"}
              </div>
            )}
            {((def.synonyms?.length ?? 0) > 0 || (def.antonyms?.length ?? 0) > 0) && (
              <div className="mt-1 text-[12px]">
                {def.synonyms?.length ? (
                  <span className="mr-3">
                    <span className="text-slate-500">syn.</span>{" "}
                    <span className="text-green-800">{def.synonyms.slice(0, 6).join(", ")}</span>
                  </span>
                ) : null}
                {def.antonyms?.length ? (
                  <span>
                    <span className="text-slate-500">ant.</span>{" "}
                    <span className="text-rose-800">{def.antonyms.slice(0, 6).join(", ")}</span>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
