/* LexiPop - decide whether a selection is a word/short phrase or running text */

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}

/** Letters Urdu keyboards type but Arabic doesn't use: ٹ ڈ ڑ ں ے ۓ ھ ہ ۂ ۃ ی ک گ پ چ ژ */
const URDU_ONLY = /[\u0679\u0688\u0691\u06BA\u06D2\u06D3\u06BE\u06C1\u06C2\u06C3\u06CC\u06A9\u06AF\u067E\u0686\u0698]/;

/**
 * Guess the lookup language from the text itself: Latin -> English, Arabic script with any
 * Urdu-only letter -> Urdu, any other Arabic script (incl. words spelled the same in both) -> Arabic.
 */
export function detectLang(text: string): "en" | "ar" | "ur" {
  if (!hasArabicScript(text)) return "en";
  return URDU_ONLY.test(text) ? "ur" : "ar";
}

/** The language to look up with: "auto" (or English chosen for Arabic-script text) is detected. */
export function resolveLang(text: string, chosen: string): string {
  if (chosen === "auto") return detectLang(text);
  if (chosen === "en" && hasArabicScript(text)) return detectLang(text);
  return chosen;
}

/** Sentences and paragraphs get full-text translation; words and short phrases go to the dictionary. */
export function isRunningText(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  const words = t.split(" ").length;
  if (words >= 4) return true;
  if (t.length > 40) return true;
  // "Hello. How are" — sentence punctuation followed by more text
  return /[.!?؟۔،]\s+\S/.test(t);
}
