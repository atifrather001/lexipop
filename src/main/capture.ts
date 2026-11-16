/* LexiPop - grab the word under the cursor / current selection via the clipboard */
import { clipboard } from "electron";
import type { InputHelper } from "./inputHelper.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SENTINEL = "\u0000lexipop\u0000";

function firstWord(text: string): string {
  const cleaned = text.replace(/[\r\n\t]+/g, " ").trim();
  if (!cleaned) return "";
  // Keep a short phrase as-is; otherwise take the first word-like token
  if (cleaned.length <= 40 && !/\s/.test(cleaned)) return cleaned.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const m = /[\p{L}\p{N}'’-]+/u.exec(cleaned);
  return m ? m[0] : "";
}

/**
 * Returns the selected text, or the word under the cursor (via double-click), or "".
 * Restores the user's clipboard afterwards.
 */
export async function captureWord(input: InputHelper): Promise<string> {
  const saved = clipboard.readText();
  try {
    // The user is still holding Ctrl from the trigger; release modifiers virtually so
    // the word-selecting double-click isn't read as Ctrl+click.
    await input.run("ctrlup");
    await sleep(30);
    clipboard.writeText(SENTINEL);
    await input.run("copy");
    await sleep(120);
    let text = clipboard.readText();
    if (text === SENTINEL || !text.trim()) {
      // nothing selected: select the word under the cursor, then copy
      await input.run("dblclick");
      await sleep(80);
      clipboard.writeText(SENTINEL);
      await input.run("copy");
      await sleep(120);
      text = clipboard.readText();
      if (text === SENTINEL) text = "";
    }
    return firstWord(text);
  } finally {
    clipboard.writeText(saved);
  }
}
