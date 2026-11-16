/* LexiPop - SearchBox (toolbar input) */
import { useEffect, useRef } from "react";

interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  onLookup: (v: string) => void;
  loading: boolean;
  placeholder?: string;
}

export function SearchBox({ value, onChange, onLookup, loading, placeholder = "Type a word…" }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box; Esc blurs it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        className="bx-input pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onLookup(value.trim());
          }
        }}
        disabled={loading}
      />
      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]">&#128269;</div>
    </div>
  );
}
