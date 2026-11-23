/* LexiPop - About dialog (version + publisher) */
import { useEffect, useState } from "react";

const PUBLISHER = "NexaSecure Cloud and AI";

const CREDITS = [
  "Wiktionary",
  "Wikipedia & Wikidata",
  "Free Dictionary API",
  "Datamuse",
  "MyMemory",
  "ExchangeRate-API",
  "OpenStreetMap",
];

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    (window as any).lexipop?.app?.getVersion?.().then((v: string) => setVersion(v)).catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-title"
    >
      <div
        className="w-[360px] max-w-[92vw] rounded-md bg-white shadow-xl border overflow-hidden"
        style={{ borderColor: "var(--bx-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lx-banner lx-banner--compact" style={{ height: 56 }}>
          <div className="lx-aurora lx-aurora-1" />
          <div className="lx-aurora lx-aurora-2" />
          <div className="lx-banner-inner">
            <div className="lx-orb" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <img src="./lexipop-icon.svg" alt="" style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
            <div id="about-title" className="lx-wordmark" style={{ fontSize: 20 }}>
              LexiPop
            </div>
          </div>
        </div>

        <div className="px-5 py-4 text-center">
          <div className="text-[14px] font-semibold text-slate-800">Version {version || "…"}</div>
          <div className="mt-1 text-[12.5px] text-slate-600">Multi-language dictionary for Windows</div>

          <div className="mt-4 text-[12px] text-slate-500">Created by</div>
          <div className="text-[15px] font-bold" style={{ color: "var(--bx-bar-text)" }}>
            {PUBLISHER}
          </div>

          <div className="mt-4 text-[11px] text-slate-500 leading-relaxed">
            Data from {CREDITS.join(" · ")}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            © {new Date().getFullYear()} {PUBLISHER}. All rights reserved.
          </div>

          <button type="button" className="bx-btn mt-4 min-w-[90px]" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
