/* LexiPop - offline text-to-speech (sherpa-onnx + Piper voices) for languages Windows has no voice for */
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Voice folders shipped in resources/voices (see scripts/get-voices.mjs). */
const VOICES: Record<string, string> = {
  ar: "ar/ar_JO-kareem-medium.onnx",
  ur: "ur/ur_PK-fasih-medium.onnx",
};

/** Unload a voice after this long without use (each one holds ~100 MB of RAM). */
const IDLE_MS = 5 * 60 * 1000;

type Engine = { tts: any; timer: NodeJS.Timeout | null };
const engines = new Map<string, Engine>();
let sherpa: any | null | undefined;

function voicesDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "voices") : path.join(app.getAppPath(), "voices");
}

function loadSherpa(): any | null {
  if (sherpa !== undefined) return sherpa;
  try {
    sherpa = require("sherpa-onnx-node");
  } catch (err) {
    console.error("[LexiPop] sherpa-onnx-node not available:", err);
    sherpa = null;
  }
  return sherpa;
}

/** Languages with a bundled offline voice on disk. */
export function offlineVoices(): string[] {
  return Object.keys(VOICES).filter((l) => fs.existsSync(path.join(voicesDir(), VOICES[l]!)));
}

function engineFor(lang: string): any | null {
  const rel = VOICES[lang];
  if (!rel) return null;
  let e = engines.get(lang);
  if (!e) {
    const lib = loadSherpa();
    const dir = voicesDir();
    const model = path.join(dir, rel);
    if (!lib || !fs.existsSync(model)) return null;
    const tts = new lib.OfflineTts({
      model: {
        vits: {
          model,
          tokens: path.join(path.dirname(model), "tokens.txt"),
          dataDir: path.join(dir, "espeak-ng-data"),
        },
        numThreads: 2,
        provider: "cpu",
        debug: false,
      },
      maxNumSentences: 1,
    });
    e = { tts, timer: null };
    engines.set(lang, e);
  }
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => engines.delete(lang), IDLE_MS);
  return e.tts;
}

/** 16-bit PCM mono WAV from float samples. */
function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

/** Speak text with the bundled voice; returns a WAV file, or null if there is no voice for it. */
export function synthesize(text: string, lang: string): Uint8Array | null {
  const t = text.trim().slice(0, 1000);
  if (!t) return null;
  const tts = engineFor(lang);
  if (!tts) return null;
  // Electron forbids native "external" buffers: ask sherpa-onnx to copy the samples instead
  const audio = tts.generate({ text: t, sid: 0, speed: 0.9, enableExternalBuffer: false });
  if (!audio?.samples?.length) return null;
  return toWav(audio.samples as Float32Array, audio.sampleRate as number);
}
