/* LexiPop - MyMemory translation fallback (free, no key; ~5k chars/day anonymous) */

const API = "https://api.mymemory.translated.net/get";

/** Translate one English word/phrase into the target language. Returns null on failure. */
export async function myMemoryTranslate(text: string, target: string): Promise<string | null> {
  return myMemoryTranslatePair(text, "en", target);
}

/** Translate text (max 500 bytes per request) between any two languages. Returns null on failure. */
export async function myMemoryTranslatePair(text: string, source: string, target: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ q: text, langpair: `${source}|${target}` });
    const res = await fetch(`${API}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const t: string | undefined = data?.responseData?.translatedText;
    if (!t || data?.responseStatus !== 200) return null;
    // MyMemory echoes the input (or an upper-cased copy) when it has nothing
    if (t.trim().toLowerCase() === text.trim().toLowerCase()) return null;
    return t.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
