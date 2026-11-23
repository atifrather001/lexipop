/* LexiPop - Encyclopedia provider: Wikipedia summary + Wikidata country facts (no API key) */
import type { CountryFacts, EncyclopediaEntry } from "../shared/types";

// Wikimedia requires a descriptive User-Agent; anonymous UAs get 403.
const UA = "LexiPop/1.0 (Windows desktop dictionary; contact: lexipop@example.com)";
const WIKI_LANGS = new Set(["en", "ur", "ar", "fa"]);

async function getJson(url: string, timeoutMs = 10000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface WikiPage {
  pageid?: number;
  missing?: boolean;
  invalid?: boolean;
  title: string;
  extract?: string;
  description?: string;
  thumbnail?: { source: string };
  coordinates?: Array<{ lat: number; lon: number }>;
  pageprops?: { wikibase_item?: string; disambiguation?: string };
  fullurl?: string;
}

/** Keep the first few sentences of an intro, cutting at a sentence end (handles Urdu "۔"). */
export function trimExtract(text: string, max = 900): string {
  const clean = text.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("۔"), slice.lastIndexOf("。"));
  return (cut > max * 0.4 ? slice.slice(0, cut + 1) : slice.trimEnd() + "…").trim();
}

async function fetchWikiPage(term: string, wikiLang: string): Promise<WikiPage | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "extracts|pageimages|coordinates|pageprops|description|info",
    exintro: "1",
    explaintext: "1",
    pithumbsize: "320",
    ppprop: "wikibase_item|disambiguation",
    inprop: "url",
    titles: term,
  });
  const data = (await getJson(`https://${wikiLang}.wikipedia.org/w/api.php?${params}`)) as
    | { query?: { pages?: WikiPage[] } }
    | null;
  const page = data?.query?.pages?.[0];
  if (!page || page.missing || page.invalid || !page.pageid) return null;
  if (page.pageprops && "disambiguation" in page.pageprops) return null;
  if (!page.extract?.trim()) return null;
  return page;
}

type Binding = Record<string, { value: string } | undefined>;

/** Fold the SPARQL rows (one per combination of multi-valued props) into one fact sheet. */
export function parseCountryBindings(rows: Binding[]): CountryFacts | null {
  if (!rows.length) return null;
  const set = (key: string) =>
    [...new Set(rows.map((r) => r[key]?.value).filter((v): v is string => !!v))];
  const nums = (key: string) => set(key).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  const pops = nums("population");
  const areas = nums("area");
  const flag = set("flag")[0];
  return {
    iso2: set("iso")[0],
    capital: set("capitalLabel"),
    continent: set("continentLabel"),
    population: pops.length ? Math.max(...pops) : undefined,
    areaKm2: areas.length ? Math.max(...areas) : undefined,
    currencies: set("currencyLabel"),
    languages: set("languageLabel"),
    // Special:FilePath URLs redirect to the image; ask for a small rendition
    flagUrl: flag ? `${flag.replace(/^http:/, "https:")}?width=120` : undefined,
  };
}

/** Country facts from Wikidata. Returns null for anything that has no ISO 3166-1 code. */
async function fetchCountryFacts(qid: string, labelLang: string): Promise<CountryFacts | null> {
  if (!/^Q\d+$/.test(qid)) return null;
  const query = `
    SELECT ?iso ?capitalLabel ?continentLabel ?population ?area ?currencyLabel ?languageLabel ?flag WHERE {
      wd:${qid} wdt:P297 ?iso .
      OPTIONAL { wd:${qid} wdt:P36 ?capital . }
      OPTIONAL { wd:${qid} wdt:P30 ?continent . }
      OPTIONAL { wd:${qid} wdt:P1082 ?population . }
      OPTIONAL { wd:${qid} wdt:P2046 ?area . }
      OPTIONAL { wd:${qid} wdt:P38 ?currency . }
      OPTIONAL { wd:${qid} wdt:P37 ?language . }
      OPTIONAL { wd:${qid} wdt:P41 ?flag . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${labelLang},en". }
    } LIMIT 200`;
  const data = (await getJson(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
    12000
  )) as { results?: { bindings?: Binding[] } } | null;
  return parseCountryBindings(data?.results?.bindings ?? []);
}

/**
 * Encyclopedia lookup: the Wikipedia edition for `lang` first (ur/ar/fa/en), then English.
 * Returns null when there is no real article (missing or a disambiguation page).
 */
export async function lookupEncyclopedia(term: string, lang: string): Promise<EncyclopediaEntry | null> {
  const t = term.trim();
  if (!t || t.length > 100) return null;
  const order = [...new Set([WIKI_LANGS.has(lang) ? lang : "en", "en"])];

  for (const wikiLang of order) {
    let page = await fetchWikiPage(t, wikiLang);
    // "SPAIN" / "new york" -> try Title Case for Latin-script input
    if (!page && /[a-z]/i.test(t)) {
      const titled = t.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
      if (titled !== t) page = await fetchWikiPage(titled, wikiLang);
    }
    if (!page) continue;

    const qid = page.pageprops?.wikibase_item;
    const country = qid ? await fetchCountryFacts(qid, wikiLang) : null;
    const coord = page.coordinates?.[0];
    return {
      term: t,
      wikiLang,
      title: page.title,
      description: page.description,
      extract: trimExtract(page.extract ?? ""),
      thumbnail: page.thumbnail?.source,
      coordinates: coord ? { lat: coord.lat, lon: coord.lon } : undefined,
      pageUrl:
        page.fullurl ?? `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      wikidataId: qid,
      country: country ?? undefined,
      fetchedAt: Date.now(),
      fromCache: false,
    };
  }
  return null;
}
