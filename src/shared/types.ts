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

/* ---- Encyclopedia (Wikipedia + Wikidata) ---- */

export interface CountryFacts {
  iso2?: string;
  capital: string[];
  continent: string[];
  population?: number;
  areaKm2?: number;
  currencies: string[];
  languages: string[];
  flagUrl?: string;
}

export interface EncyclopediaEntry {
  /** The term the user looked up. */
  term: string;
  /** Wikipedia language edition actually used (may be "en" as a fallback). */
  wikiLang: string;
  title: string;
  description?: string;
  extract: string;
  thumbnail?: string;
  coordinates?: { lat: number; lon: number };
  pageUrl: string;
  wikidataId?: string;
  country?: CountryFacts;
  fetchedAt: number;
  fromCache: boolean;
}

export interface EncyclopediaResult {
  entry: EncyclopediaEntry | null;
  error: string | null;
}

/* ---- Sentence / paragraph translation ---- */

export interface TextTranslationResult {
  text: string;
  from: string;
  translations: Array<{ lang: string; text: string }>;
  truncated: boolean;
  error: string | null;
}
