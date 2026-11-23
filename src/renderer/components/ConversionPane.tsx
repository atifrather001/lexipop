/* LexiPop - converter results (currency, units, temperature, time zones) */
import { Section } from "./Section";
import { CopyButton } from "./CopyButton";
import type { ConversionResult, QuantityKind } from "../../shared/convert";

const KIND_LABEL: Record<QuantityKind, string> = {
  currency: "Currency",
  length: "Length",
  mass: "Weight",
  volume: "Volume",
  temperature: "Temperature",
  speed: "Speed",
  area: "Area",
  time: "Time zones",
};

export function ConversionPane({ result }: { result: ConversionResult }) {
  return (
    <div>
      <div className="bx-section">
        <div className="bx-section-body">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-[24px] font-bold text-slate-900 leading-tight">{result.heading}</h1>
            <span className="text-[11px] uppercase tracking-wide text-slate-500">{KIND_LABEL[result.kind]}</span>
          </div>
          {result.note && <div className="mt-1 text-[12px] text-amber-800">{result.note}</div>}
        </div>
      </div>

      {result.rows.length > 0 && (
        <Section title={KIND_LABEL[result.kind]} subtitle="converter" count={result.rows.length}>
          <table className="w-full text-[14px]">
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-4 text-slate-500 whitespace-nowrap w-[1%]">{r.label}</td>
                  <td className="py-1 font-medium text-slate-900">{r.value}</td>
                  <td className="py-1 text-right">
                    <CopyButton text={r.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.source && <div className="mt-2 text-[11px] text-slate-500">{result.source}</div>}
        </Section>
      )}
    </div>
  );
}
