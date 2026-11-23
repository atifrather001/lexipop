/* LexiPop - decide whether a selection is a word/short phrase or running text */

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
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
