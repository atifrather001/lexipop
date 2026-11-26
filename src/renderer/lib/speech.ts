/* LexiPop - pronunciation playback with offline TTS fallback */

/** Windows voice chain per language (Urdu and missing Arabic fall back to LexiPop's own voices). */
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

/** Languages with an offline voice bundled with LexiPop (Urdu, Arabic). */
const OFFLINE_LANGS = new Set(["ur", "ar"]);
let currentAudio: HTMLAudioElement | null = null;

/** Play text with LexiPop's own bundled voice (main process makes a WAV). */
async function speakOffline(text: string, lang: string): Promise<boolean> {
  const tts = (window as any).lexipop?.tts;
  if (!tts?.speak) return false;
  try {
    const wav: Uint8Array | null = await tts.speak(text, lang);
    if (!wav || !wav.length) return false;
    const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    currentAudio?.pause();
    const audio = new Audio(url);
    currentAudio = audio;
    audio.addEventListener("ended", () => URL.revokeObjectURL(url));
    await audio.play();
    return true;
  } catch (err) {
    console.error("[LexiPop] offline voice failed:", err);
    return false;
  }
}

/**
 * Speak text: the installed Windows voice when there is one, otherwise LexiPop's bundled
 * offline voice (Urdu always, Arabic on PCs without the Arabic speech pack).
 * Returns false only when nothing can speak this language.
 */
export function speakWord(word: string, lang = "en"): boolean {
  const hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;
  const voice = hasSynth ? pickVoice(lang) : undefined;
  if (hasSynth) window.speechSynthesis.cancel();
  currentAudio?.pause();

  if (!voice) {
    if (OFFLINE_LANGS.has(lang)) {
      void speakOffline(word, lang);
      return true;
    }
    console.warn(`[LexiPop] no voice installed for "${lang}". Installed:`, listVoices());
    return false; // don't let Chromium mis-read it with the default English voice
  }
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  } catch (err) {
    console.error("[LexiPop] speechSynthesis failed:", err);
    if (OFFLINE_LANGS.has(lang)) {
      void speakOffline(word, lang);
      return true;
    }
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
