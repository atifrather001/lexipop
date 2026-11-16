/* LexiPop - collapsible glossary-style section */
import { useState, type ReactNode } from "react";

interface SectionProps {
  title: string;
  subtitle?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Section({ title, subtitle, count, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bx-section">
      <div className="bx-section-head" onClick={() => setOpen((o) => !o)}>
        <span className="w-3 text-[10px] text-slate-500">{open ? "▼" : "▶"}</span>
        <span>{title}</span>
        {subtitle && <span className="font-normal text-slate-500">&middot; {subtitle}</span>}
        {typeof count === "number" && (
          <span className="ml-auto font-normal text-slate-500">{count}</span>
        )}
      </div>
      {open && <div className="bx-section-body">{children}</div>}
    </section>
  );
}
