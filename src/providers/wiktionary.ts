/* LexiPop - Wiktionary provider: etymology + human-recorded pronunciations */
import type { DictionaryProvider, Phonetic, WordEntry } from "../shared/types";

const API = "https://en.wiktionary.org/w/api.php";
// Wikimedia requires a descriptive User-Agent; anonymous UAs get 403.
const UA = "LexiPop/1.0 (Windows desktop dictionary; contact: lexipop@example.com)";

/** Target languages pulled from the English page's Translations tables. */
const TRANSLATION_TARGETS: Record<string, { label: string; lang: string }> = {
  ur: { label: "Urdu", lang: "ur" },
  ar: { label: "Arabic", lang: "ar" },
};

const LANG_HEADING: Record<string, string> = {
  en: "English",
  ur: "Urdu",
  ar: "Arabic",
  fa: "Persian",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, "")
      .replace(/<span[^>]*class="[^"]*mw-editsection"[^>]*>[\s\S]*?<\/span>\s*<\/span>/gi, "")
      .replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|dd|dt)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\[edit\]/g, "")
    .replace(/^\s*edit\s+/i, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Slice the HTML for one language's section (between its h2 and the next h2). */
function languageSection(html: string, heading: string): string | null {
  const re = new RegExp(`<h2[^>]*id="${heading}"[^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index;
  const rest = html.slice(start + m[0].length);
  const next = /<h2[\s>]/i.exec(rest);
  return next ? html.slice(start, start + m[0].length + next.index) : html.slice(start);
}

function etymologyFrom(section: string): string | undefined {
  // First "Etymology" / "Etymology_1" heading (h3/h4), text until the next heading
  const re = /<h[3-5][^>]*id="Etymology(?:_\d+)?"[^>]*>[\s\S]*?<\/h[3-5]>/i;
  const m = re.exec(section);
  if (!m) return undefined;
  let body = section.slice(m.index + m[0].length);
  const next = /<h[2-5][\s>]/i.exec(body);
  if (next) body = body.slice(0, next.index);
  const text = stripHtml(body);
  return text.length > 0 ? text : undefined;
}

function pronunciationsFrom(section: string): Phonetic[] {
  const out: Phonetic[] = [];
  const seen = new Set<string>();

  // IPA transcriptions in the Pronunciation block
  const ipa: string[] = [];
  const ipaRe = /<span[^>]*class="[^"]*\bIPA\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let im: RegExpExecArray | null;
  while ((im = ipaRe.exec(section)) && ipa.length < 4) {
    const t = stripHtml(im[1] ?? "");
    if (t && !ipa.includes(t)) ipa.push(t);
  }

  // Audio: prefer the mp3 transcode, otherwise the original ogg
  const audioRe = /<audio[\s\S]*?<\/audio>/gi;
  let am: RegExpExecArray | null;
  while ((am = audioRe.exec(section)) && out.length < 4) {
    const block = am[0];
    const mp3 = /src="([^"]+\.mp3)"/i.exec(block)?.[1];
    const ogg = /src="([^"]+\.(?:ogg|oga|wav))"/i.exec(block)?.[1];
    const src = mp3 ?? ogg;
    if (!src) continue;
    const url = src.startsWith("//") ? `https:${src}` : src;
    if (seen.has(url)) continue;
    seen.add(url);
    const file = decodeURIComponent(url.split("/").pop() ?? "");
    const accent =
      /en-us|-us-/i.test(file) ? "US" :
      /en-uk|en-gb|-uk-|-gb-/i.test(file) ? "UK" :
      /en-au/i.test(file) ? "AU" : "";
    const label = ipa[out.length] ?? (accent ? `(${accent})` : "(audio)");
    out.push({ text: label, audio: url, source: "Wiktionary" });
  }

  return out;
}

/**
 * Wiktionary translation tables look like:
 *   <table class="translations" data-gloss="greeting"> ... <li>Urdu: <span lang="ur">ہیلو</span> (<span class="tr">helo</span>)</li>
 * Returns { ur: ["ہیلو (helo) — greeting"], ar: [...] }.
 */
function translationsFrom(section: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const tableRe = /<table[^>]*class="[^"]*\btranslations\b[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(section))) {
    const open = tm[0].slice(0, tm[0].indexOf(">") + 1);
    const gloss = stripHtml(/data-gloss="([^"]*)"/i.exec(open)?.[1] ?? "");
    const body = tm[1] ?? "";

    for (const [code, target] of Object.entries(TRANSLATION_TARGETS)) {
      // Top-level <li> for the language; dialects are nested in <dl> which we cut off.
      const liRe = new RegExp(`<li>\\s*${target.label}:([\\s\\S]*?)(?:<dl>|</li>)`, "gi");
      let lm: RegExpExecArray | null;
      while ((lm = liRe.exec(body))) {
        const chunk = lm[1] ?? "";
        const termRe = new RegExp(`<span[^>]*lang="${target.lang}"[^>]*>([\\s\\S]*?)</span>`, "gi");
        const trRe = /<span[^>]*class="[^"]*\btr\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
        const terms: string[] = [];
        let x: RegExpExecArray | null;
        while ((x = termRe.exec(chunk)) && terms.length < 4) {
          const t = stripHtml(x[1] ?? "");
          if (t && !terms.includes(t)) terms.push(t);
        }
        const trs: string[] = [];
        while ((x = trRe.exec(chunk)) && trs.length < 4) {
          const t = stripHtml(x[1] ?? "");
          if (t) trs.push(t);
        }
        terms.forEach((term, i) => {
          const tr = trs[i] ? ` (${trs[i]})` : "";
          const g = gloss ? ` \u2014 ${gloss}` : "";
          const line = `${term}${tr}${g}`;
          if (!out[code]) out[code] = [];
          if (!out[code]!.includes(line)) out[code]!.push(line);
        });
      }
    }
  }
  return out;
}

/** For inflected forms ("simple past of launch"), the lemma the page points to. */
function lemmaFrom(section: string): string | undefined {
  const m = /class="form-of-definition-link"[\s\S]*?<a[^>]*href="\/wiki\/([^"#]+)#English"/i.exec(section);
  if (!m?.[1]) return undefined;
  try { return decodeURIComponent(m[1].replace(/_/g, " ")); } catch { return undefined; }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, {
    signal,
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Wiktionary: HTTP ${res.status}`);
  return res.json();
}

export class WiktionaryProvider implements DictionaryProvider {
  name = "Wiktionary";
  readonly supports: ReadonlyArray<string> = ["en", "ur", "ar", "fa"];

  private async fetchSection(word: string, heading: string, signal: AbortSignal): Promise<string | null> {
    const params = new URLSearchParams({
      action: "parse",
      page: word,
      prop: "text",
      format: "json",
      formatversion: "2",
      disabletoc: "1",
      redirects: "1",
    });
    const data = await fetchJson(`${API}?${params}`, signal);
    if (data?.error) return null; // missing page etc.
    const html: string = data?.parse?.text ?? "";
    return languageSection(html, heading);
  }

  async lookup(word: string, lang: string): Promise<Partial<WordEntry>> {
    const heading = LANG_HEADING[lang];
    if (!heading) return {};

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const section = await this.fetchSection(word, heading, controller.signal);
      if (!section) return {};

      let etymology = etymologyFrom(section);
      let phonetics = pronunciationsFrom(section);
      let translations = lang === "en" ? translationsFrom(section) : {};

      // Inflected form (e.g. "launched" -> "launch"): borrow what the lemma page has
      const lemma = lemmaFrom(section);
      if (lemma && lemma.toLowerCase() !== word.toLowerCase() && (!etymology || !phonetics.length || !Object.keys(translations).length)) {
        const base = await this.fetchSection(lemma, heading, controller.signal).catch(() => null);
        if (base) {
          if (!etymology) {
            const e = etymologyFrom(base);
            if (e) etymology = `(from ${lemma}) ${e}`;
          }
          if (!phonetics.length) phonetics = pronunciationsFrom(base);
          if (lang === "en" && !Object.keys(translations).length) translations = translationsFrom(base);
        }
      }

      if (!etymology && phonetics.length === 0 && Object.keys(translations).length === 0) return {};
      return { etymology, phonetics, translations, sources: ["Wiktionary"] };
    } finally {
      clearTimeout(timeout);
    }
  }
}
