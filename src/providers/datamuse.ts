/* LexiPop - Datamuse provider (synonyms, antonyms, related words) */
import { DictionaryProvider } from "../shared/types";
import type { WordEntry } from "../shared/types";

type DatamuseWord = { word: string; score?: number };

export class DatamuseProvider implements DictionaryProvider {
  name = "Datamuse";
  readonly supports: ReadonlyArray<string> = ["en"];

  private async fetchRel(rel: string, word: string): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(
        `https://api.datamuse.com/words?${rel}=${encodeURIComponent(word)}&max=25`,
        { signal: controller.signal }
      );
      if (!res.ok) return [];
      const data: DatamuseWord[] = (await res.json()) as DatamuseWord[];
      return data.map((d) => d.word).filter(Boolean);
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async lookup(word: string, lang: string): Promise<Partial<WordEntry>> {
    if (lang !== "en") return {};

    const [synonyms, antonyms] = await Promise.all([
      this.fetchRel("rel_syn", word),
      this.fetchRel("rel_ant", word),
    ]);

    return {
      synonyms,
      antonyms,
      sources: ["Datamuse"],
    };
  }
}
