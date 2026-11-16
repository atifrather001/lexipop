/* LexiPop - shared types (strict, no any) */

export interface Phonetic {
  text: string;
  audio?: string;
  source: string;
}

export interface Definition {
  definition: string;
  example?: string;
  synonyms: string[];
  antonyms: string[];
  partOfSpeech: string;
  source: string;
}

export interface Translation {
  lang: string;
  text: string;
  source: string;
}

export interface WordEntry {
  word: string;
  language: string;
  phonetics: Phonetic[];
  definitions: Definition[];
  synonyms: string[];
  antonyms: string[];
  translations: Record<string, string[]>;
  examples: string[];
  etymology?: string;
  sources: string[];
  lookupAt: number;
  fromCache: boolean;
}

export interface DictionaryProvider {
  name: string;
  /** Language codes this provider can serve (e.g. ["en"] or ["en","ur","ar","fa"]). */
  supports: ReadonlyArray<string>;
  lookup(word: string, lang: string): Promise<Partial<WordEntry>>;
}

export interface LookupResult {
  entry: WordEntry | null;
  error: string | null;
  warnings: string[];
}

export interface HistoryItem {
  id: number;
  word: string;
  lang: string;
  lookedUpAt: number;
}

export interface FavoriteItem {
  id: number;
  word: string;
  lang: string;
  tags: string[];
  addedAt: number;
}

export type TabKey = "definitions" | "synonyms" | "examples" | "etymology" | "translations";

export interface ProviderSource {
  name: string;
  sections: string[];
}
