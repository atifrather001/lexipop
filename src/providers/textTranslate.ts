/* LexiPop - full sentence / paragraph translation via MyMemory (chunked to its 500-byte limit) */
import { myMemoryTranslatePair } from "./mymemory.js";
import type { TextTranslationResult } from "../shared/types";

const MAX_CHARS = 1500;
const CHUNK_BYTES = 450;
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s).length;

/** Split text into pieces under the byte limit, preferring sentence and then word boundaries. */
export function chunkText(text: string, limit = CHUNK_BYTES): string[] {
  const sentences = text.split(/(?<=[.!?؟۔])\s+/);
  const out: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const s of sentences) {
    if (bytes(s) > limit) {
      push();
      for (const w of s.split(/\s+/)) {
        if (bytes(cur ? `${cur} ${w}` : w) > limit) push();
        cur = cur ? `${cur} ${w}` : w;
      }
      push();
      continue;
    }
    if (bytes(cur ? `${cur} ${s}` : s) > limit) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

const memo = new Map<string, string>();

async function translateAll(text: string, from: string, to: string): Promise<string | null> {
  const key = `${from}|${to}|${text}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const parts: string[] = [];
  for (const chunk of chunkText(text)) {
    const t = await myMemoryTranslatePair(chunk, from, to);
    if (!t) return parts.length ? parts.join(" ") + " …" : null;
    parts.push(t);
  }
  const joined = parts.join(" ");
  if (memo.size > 200) memo.clear();
  memo.set(key, joined);
  return joined;
}

/** English text -> Urdu + Arabic; Urdu/Arabic/Persian text -> English. */
export async function translateText(raw: string, from: string): Promise<TextTranslationResult> {
  const collapsed = raw.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = collapsed.length > MAX_CHARS;
  const text = truncated ? collapsed.slice(0, MAX_CHARS).replace(/\s+\S*$/, "") : collapsed;
  const targets = from === "en" ? ["ur", "ar"] : ["en"];
  const results = await Promise.all(targets.map((to) => translateAll(text, from, to)));
  const translations = targets
    .map((lang, i) => ({ lang, text: results[i] ?? "" }))
    .filter((t) => t.text);
  return {
    text,
    from,
    translations,
    truncated,
    error: translations.length ? null : "Translation service unavailable (offline or daily limit reached).",
  };
}
