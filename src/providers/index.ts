/* LexiPop - provider index + merge logic */
import {
  DictionaryProvider,
  LookupResult,
  WordEntry,
} from "../shared/types";
import { FreeDictionaryProvider } from "./freedictionary.js";
import { DatamuseProvider } from "./datamuse.js";
import { WiktionaryProvider } from "./wiktionary.js";
import { myMemoryTranslate } from "./mymemory.js";

/** Languages we always try to provide translations for when looking up English. */
const TRANSLATION_LANGS = ["ur", "ar"] as const;

type StrictPartial<T> = {
  [P in keyof T]?: T[P];
};

const providers: DictionaryProvider[] = [
  new WiktionaryProvider(),
  new FreeDictionaryProvider(),
  new DatamuseProvider(),
];

export { DictionaryProvider };
export type { WordEntry, LookupResult };

export function getProviders(lang: string): DictionaryProvider[] {
  return providers.filter((p) => p.supports.includes(lang));
}

export function allProviders(): DictionaryProvider[] {
  return [...providers];
}

export async function lookupWord(
  word: string,
  lang: string
): Promise<LookupResult> {
  const warnings: string[] = [];
  const active = getProviders(lang);

  if (active.length === 0) {
    return {
      entry: null,
      error: `No provider supports language "${lang}".`,
      warnings,
    };
  }

  const results = await Promise.allSettled(
    active.map((p) => p.lookup(word, lang))
  );

  const merged: StrictPartial<WordEntry> = {
    word,
    language: lang,
    phonetics: [],
    definitions: [],
    synonyms: [],
    antonyms: [],
    translations: {},
    examples: [],
    sources: [],
  };

  for (const result of results) {
    if (result.status === "fulfilled") {
      const data = result.value;
      const sections: string[] = [];
      if (data.phonetics?.length) {
        merged.phonetics!.push(...data.phonetics);
        sections.push("phonetics");
      }
      if (data.definitions?.length) {
        merged.definitions!.push(...data.definitions);
        sections.push("definitions");
      }
      if (data.synonyms?.length) {
        merged.synonyms!.push(...data.synonyms);
        sections.push("synonyms");
      }
      if (data.antonyms?.length) {
        merged.antonyms!.push(...data.antonyms);
        sections.push("antonyms");
      }
      if (data.translations) {
        for (const [l, texts] of Object.entries(data.translations)) {
          if (!merged.translations![l]) merged.translations![l] = [];
          merged.translations![l].push(...texts);
          sections.push(`translations:${l}`);
        }
      }
      if (data.examples?.length) {
        merged.examples!.push(...data.examples);
        sections.push("examples");
      }
      if (data.etymology && !merged.etymology) {
        merged.etymology = data.etymology;
        sections.push("etymology");
      }
      if (data.sources?.length) {
        merged.sources!.push(...data.sources);
      }
    } else {
      const reason = result.reason;
      warnings.push(
        `Provider failed: ${reason instanceof Error ? reason.message : String(reason)}`
      );
    }
  }

  // English: Free Dictionary already covers common words, so Wiktionary's definitions are only
  // kept when nothing else had any (names of places, people, organisations...). Urdu/Arabic/Persian
  // rely on Wiktionary alone.
  if (lang === "en" && merged.definitions!.some((d) => d.source !== "Wiktionary")) {
    merged.definitions = merged.definitions!.filter((d) => d.source !== "Wiktionary");
  }

  // de-duplicate arrays
  merged.synonyms = [...new Set(merged.synonyms)];
  merged.antonyms = [...new Set(merged.antonyms)];
  merged.sources = [...new Set(merged.sources)];
  const trans = merged.translations ?? {};
  for (const langKey of Object.keys(trans)) {
    trans[langKey] = [...new Set(trans[langKey])];
  }

  // Fallback translations for any target Wiktionary did not cover
  if (lang === "en") {
    const missing = TRANSLATION_LANGS.filter((l) => !(trans[l]?.length));
    if (missing.length) {
      const results2 = await Promise.all(missing.map((l) => myMemoryTranslate(word, l)));
      results2.forEach((t, i) => {
        const l = missing[i]!;
        if (t) {
          trans[l] = [`${t} \u2014 MyMemory`];
          if (!merged.sources!.includes("MyMemory")) merged.sources!.push("MyMemory");
        }
      });
    }
  }

  const entry: WordEntry = {
    word,
    language: lang,
    phonetics: merged.phonetics ?? [],
    definitions: merged.definitions ?? [],
    synonyms: merged.synonyms ?? [],
    antonyms: merged.antonyms ?? [],
    translations: merged.translations ?? {},
    examples: merged.examples ?? [],
    etymology: merged.etymology,
    sources: merged.sources ?? [],
    lookupAt: Date.now(),
    fromCache: false,
  };

  return { entry, error: null, warnings };
}
