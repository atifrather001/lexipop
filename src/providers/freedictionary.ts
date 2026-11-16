/* LexiPop - Free Dictionary API provider */
import { DictionaryProvider, Phonetic, Definition } from "../shared/types";
import type { WordEntry } from "../shared/types";

const BASE = "https://api.dictionaryapi.dev/api/v2/entries/en";

export class FreeDictionaryProvider implements DictionaryProvider {
  name = "Free Dictionary API";
  readonly supports: ReadonlyArray<string> = ["en"];

  async lookup(word: string, lang: string): Promise<Partial<WordEntry>> {
    if (lang !== "en") return {};

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(word)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (res.status === 404) return {};
      if (!res.ok) {
        throw new Error(`Free Dictionary API: HTTP ${res.status}`);
      }

      const data: any[] = (await res.json()) as any[];
      if (!data || !data.length) return {};

      const entry = data[0];
      const wordText = entry.word || word;

      const phonetics: Phonetic[] = (entry.phonetics || [])
        .filter((p: any) => p.text || p.audio)
        .map((p: any) => ({
          text: p.text || "",
          audio: p.audio || undefined,
          source: "Free Dictionary API",
        }));

      const definitions: Definition[] = [];
      const synonyms = new Set<string>();
      const antonyms = new Set<string>();
      const examples = new Set<string>();

      for (const meaning of entry.meanings || []) {
        const pos = meaning.partOfSpeech || "";
        for (const def of meaning.definitions || []) {
          if (!def.definition) continue;
          definitions.push({
            definition: def.definition,
            example: def.example || undefined,
            synonyms: (def.synonyms || []).filter(Boolean),
            antonyms: (def.antonyms || []).filter(Boolean),
            partOfSpeech: pos,
            source: "Free Dictionary API",
          });
          (def.synonyms || []).forEach((s: string) => synonyms.add(s));
          (def.antonyms || []).forEach((a: string) => antonyms.add(a));
          if (def.example) examples.add(def.example);
        }
      }

      return {
        word: wordText,
        language: "en",
        phonetics,
        definitions,
        synonyms: Array.from(synonyms),
        antonyms: Array.from(antonyms),
        examples: Array.from(examples),
        sources: ["Free Dictionary API"],
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
