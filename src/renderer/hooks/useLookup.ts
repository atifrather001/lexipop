/* LexiPop - renderer hook for dictionary lookup */
import { useCallback, useState } from "react";
import type { LookupResult, WordEntry } from "../shared/types";

export function useLookup() {
  const [result, setResult] = useState<LookupResult>({
    entry: null,
    error: null,
    warnings: [],
  });
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (word: string, lang = "en", force = false) => {
    if (!word || !word.trim()) return;
    setLoading(true);
    setResult({ entry: null, error: null, warnings: [] });
    try {
      const api = (window as any).lexipop;
      if (!api || typeof api.lookup !== "function") {
        throw new Error(
          "LexiPop preload API not available. The preload script may not have loaded. " +
            "Open DevTools (Ctrl+Shift+I) and check for preload errors."
        );
      }
      const res: LookupResult = await api.lookup(word.trim(), lang, force);
      setResult(res);
    } catch (err) {
      setResult({
        entry: null,
        error: err instanceof Error ? err.message : "Lookup failed.",
        warnings: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult({ entry: null, error: null, warnings: [] });
  }, []);

  return { result, loading, lookup, clear, entry: result.entry };
}

export type { WordEntry };
