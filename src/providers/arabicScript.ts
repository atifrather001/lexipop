/* LexiPop - Arabic-script helpers: strip vowel marks and guess dictionary forms (Arabic/Urdu/Persian) */

/** Harakat, tanween, shadda, sukun, superscript alef, Quranic marks and tatweel. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

export function stripArabicMarks(s: string): string {
  return s.replace(MARKS, "").trim();
}

const AR_PREFIXES = ["وال", "فال", "بال", "كال", "لل", "ال"];
const AR_ONE_LETTER = ["و", "ف", "ب", "ل", "ك"];
const AR_SUFFIXES = ["هما", "كما", "ات", "ون", "ين", "ان", "ها", "هم", "هن", "كم", "نا", "ة", "ه", "ي"];

/**
 * Titles to try on Wiktionary, best guess first. Wiktionary's Arabic/Urdu headwords are written
 * without vowel marks, and in the base (dictionary) form, e.g. "تَبَرُّعًا" -> "تبرعا" -> "تبرع".
 */
export function lookupCandidates(word: string, lang: string): string[] {
  const out: string[] = [];
  const add = (w: string) => {
    const t = w.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(word);
  const bare = stripArabicMarks(word);
  add(bare);
  if (lang !== "ar" || /\s/.test(bare)) return out.slice(0, 8);

  // accusative tanween alif: "تبرعًا" / "تبرعا" -> "تبرع"
  if (/ًا$/.test(word) || (bare.length > 3 && bare.endsWith("ا"))) add(bare.slice(0, -1));

  const stems: string[] = [bare];
  for (const p of AR_PREFIXES) {
    if (bare.startsWith(p) && bare.length - p.length >= 3) { stems.push(bare.slice(p.length)); break; }
  }
  for (const p of AR_ONE_LETTER) {
    if (bare.startsWith(p) && bare.length - 1 >= 3) { stems.push(bare.slice(1)); break; }
  }
  for (const s of stems) {
    add(s);
    for (const suf of AR_SUFFIXES) {
      if (s.endsWith(suf) && s.length - suf.length >= 3) { add(s.slice(0, -suf.length)); break; }
    }
  }
  return out.slice(0, 8);
}
