/* LexiPop - download the bundled offline voices into ./voices (run: npm run voices) */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models";
const VOICES = [
  { lang: "ar", pkg: "vits-piper-ar_JO-kareem-medium", onnx: "ar_JO-kareem-medium.onnx" },
  { lang: "ur", pkg: "vits-piper-ur_PK-fasih-medium", onnx: "ur_PK-fasih-medium.onnx" },
];

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const out = path.join(root, "voices");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexipop-voices-"));

for (const v of VOICES) {
  const dest = path.join(out, v.lang);
  if (fs.existsSync(path.join(dest, v.onnx))) {
    console.log(`${v.lang}: already there`);
    continue;
  }
  const file = path.join(tmp, `${v.pkg}.tar.bz2`);
  console.log(`${v.lang}: downloading ${v.pkg} ...`);
  const res = await fetch(`${BASE}/${v.pkg}.tar.bz2`);
  if (!res.ok) throw new Error(`${v.pkg}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xjf", file, "-C", tmp]);
  const src = path.join(tmp, v.pkg);
  fs.mkdirSync(dest, { recursive: true });
  for (const f of [v.onnx, "tokens.txt", "MODEL_CARD"]) fs.copyFileSync(path.join(src, f), path.join(dest, f));
  if (!fs.existsSync(path.join(out, "espeak-ng-data"))) fs.cpSync(path.join(src, "espeak-ng-data"), path.join(out, "espeak-ng-data"), { recursive: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log("voices ready in", out);
