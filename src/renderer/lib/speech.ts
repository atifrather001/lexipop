/* LexiPop - pronunciation playback with offline TTS fallback */

/** Voice fallback chain per language (Windows has no Urdu SAPI voice; Arabic reads the script). */
const VOICE_FALLBACKS: Record<string, string[]> = {
  ur: ["ur"], // never substitute another language's voice for Urdu
  ar: ["ar"],
  fa: ["fa", "ar"],
  en: ["en-US", "en-GB", "en"],
};

let voicesCache: SpeechSynthesisVoice[] = [];
function loadVoices(): SpeechSynthesisVoice[] {
  if (!voicesCache.length) voicesCache = window.speechSynthesis.getVoices();
  return voicesCache;
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    voicesCache = window.speechSynthesis.getVoices();
  });
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = loadVoices();
  const chain = VOICE_FALLBACKS[lang] ?? [lang];
  for (const prefix of chain) {
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(prefix.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

/** Names of installed voices, for diagnostics. */
export function listVoices(): string[] {
  return loadVoices().map((v) => `${v.name} [${v.lang}]`);
}

/** Speak a word with the system (Windows SAPI) voice via the Web Speech API. */
export function speakWord(word: string, lang = "en"): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    const voice = pickVoice(lang);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      console.warn(`[LexiPop] no voice installed for "${lang}". Installed:`, listVoices());
      return false; // don't let Chromium mis-read it with the default English voice
    }
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  } catch (err) {
    console.error("[LexiPop] speechSynthesis failed:", err);
    return false;
  }
}

/**
 * Try the recorded clip first; if the URL is missing or fails to load
 * (Free Dictionary lists many clips that 404), fall back to TTS.
 */
export function playPronunciation(url: string | undefined, word: string, lang = "en"): void {
  if (!url) {
    speakWord(word, lang);
    return;
  }
  const src = url.startsWith("//") ? `https:${url}` : url;
  const audio = new Audio(src);
  let fellBack = false;
  const fallback = () => {
    if (fellBack) return;
    fellBack = true;
    console.warn("[LexiPop] clip unavailable, using TTS:", src);
    speakWord(word, lang);
  };
  audio.addEventListener("error", fallback);
  audio.play().catch(fallback);
}
