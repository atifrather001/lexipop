/* LexiPop - Synonyms & Antonyms */
interface SynonymAntonymProps {
  synonyms: string[];
  antonyms: string[];
}

function Row({ label, items, cls }: { label: string; items: string[]; cls: string }) {
  if (!items.length) return null;
  const copy = () => navigator.clipboard.writeText(`${label}: ${items.join(", ")}`).catch(() => {});
  return (
    <div className="flex gap-2 items-start">
      <span className="w-20 shrink-0 text-slate-500 text-[12px] pt-0.5">{label}</span>
      <div className="flex-1 flex flex-wrap">
        {items.map((s, i) => (
          <span key={i} className={`bx-tag ${cls}`}>{s}</span>
        ))}
      </div>
      <button type="button" onClick={copy} className="text-[11px] text-green-800 hover:underline shrink-0" title={`Copy ${label.toLowerCase()}`}>
        copy
      </button>
    </div>
  );
}

export function SynonymAntonymList({ synonyms, antonyms }: SynonymAntonymProps) {
  return (
    <div className="space-y-2">
      <Row label="Synonyms" items={synonyms} cls="text-green-800" />
      <Row label="Antonyms" items={antonyms} cls="text-rose-800" />
    </div>
  );
}
