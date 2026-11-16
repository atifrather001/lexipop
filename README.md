# LexiPop

A Windows 11 desktop replica of the Babylon dictionary/translation app. Built with **Electron + React + TypeScript + Vite + Tailwind**, with **SQLite** (better-sqlite3) for cache/history/favorites.

## Phase 1 — complete (this release)

- Scaffold: Vite + React + TypeScript (strict), Tailwind CSS, Electron main process
- Main window with search box (`/` focuses, Enter looks up, Esc blurs)
- Two free dictionary providers: **Free Dictionary API** (definitions, phonetics, audio, examples, synonyms/antonyms) and **Datamuse** (synonyms, antonyms)
- Provider merge logic: parallel queries, de-duplicated results, per-section source attribution, non-blocking warnings on provider failure
- SQLite cache: every successful lookup stored locally and served offline; history tracking
- Result tabs: Definitions | Synonyms & Antonyms | Examples | Etymology
- IPA pronunciation bar with play buttons (Web Audio `Audio`)
- Copy buttons for definitions/synonyms/antonyms

## Tech stack

| Layer | Tool |
|-------|------|
| UI | React 18 + TypeScript (strict) |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Desktop runtime | Electron |
| Packager | electron-builder (NSIS + MSI) |
| Database | better-sqlite3 |
| Testing | Vitest |

## Prerequisites (Windows 11)

- [Node.js LTS](https://nodejs.org/) (includes `npm`)
- Internet access for provider lookups (Free Dictionary API, Datamuse)

## Install & run (development)

Open PowerShell or CMD in this folder (`lexipop/`):

```powershell
# Clean start (recommended after any config change)
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue

# Install dependencies (includes the Electron binary)
npm install

# Compile Electron main + start Vite dev server + Electron window
npm run dev
```

The app opens a main window. Type a word (e.g. `hello`) and press Enter. Definitions, synonyms, antonyms, examples, and pronunciation appear. Works offline for previously looked-up words thanks to the SQLite cache.

## Build the Windows installer

```powershell
# Compile TypeScript + bundle the renderer
npm run build

# Package into NSIS + MSI installers
npm run dist
```

Output goes to `release/`:
- `LexiPop Setup x64.exe` (NSIS installer — choose install dir, Start menu + desktop shortcuts)
- `LexiPop x64.msi`

Run the installer to install LexiPop on Windows 11.

## Troubleshooting

**`better-sqlite3` native module / `node-gyp` errors during `npm install`**

`better-sqlite3` is a native module. `npm install` downloads a prebuilt binary for your Node version. We set `electron` to v33 (which bundles Node 22, matching your Node 22) so the prebuilt binary loads inside Electron without rebuilding.

If `npm install` still falls back to building from source and fails, you need the Windows C++ build tools:

1. Install **Visual Studio Build Tools** with the **"C++ build tools"** workload (from visualstudio.microsoft.com), plus **Python 3**.
2. Re-run: `npm install --build-from-source better-sqlite3`

**Electron window stays blank / Vite "outside of allow list"**

Fixed in this release: removed the restrictive `server.fs.allow` and set `main` to load `http://localhost:5123` in dev. Make sure you run `npm run dev` (which compiles Electron main via `tsc` first) rather than `electron .` directly.


## Project structure

```
src/main/         Electron main process, IPC, SQLite (db.ts), preload
src/providers/    DictionaryProvider interface + one file per provider + merge.ts
src/renderer/     React app: App, components, hooks
src/shared/       Strict TypeScript types (no `any`)
tests/            Vitest unit tests
```

## Provider pattern (provider architecture)

Each provider implements:

```ts
interface DictionaryProvider {
  name: string;
  supports: ReadonlyArray<string>; // language codes
  lookup(word: string, lang: string): Promise<Partial<WordEntry>>;
}
```

Providers are queried in parallel via `Promise.allSettled`; results are merged into one `WordEntry`. If one provider fails, the rest still show and a non-blocking warning appears.

To add a provider: create a new file in `src/providers/`, implement `DictionaryProvider`, and register it in `src/providers/index.ts`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server + Electron |
| `npm run build` | TypeScript compile + Vite build + electron-builder |
| `npm test` | Vitest unit tests |
| `npm run preview` | Preview production build |

## Notes

- Not affiliated with Babylon Ltd. No Babylon code or assets are used.
- API keys (for future providers) are stored via Electron `safeStorage` and never reach the renderer.
- Offline cache lives in `%APPDATA%/LexiPop/lexipop.db`.

## Roadmap (upcoming phases)

- Phase 2: MyMemory + LibreTranslate + Wiktionary translation providers; Urdu/Arabic/Persian RTL, bundled Noto fonts, Arabic normalization
- Phase 3: Global hotkey (Ctrl+Alt+L), double-Ctrl+C clipboard lookup, popup window, tray icon
- Phase 4: History, favorites with tags, CSV/JSON export, TTS/Web Speech API, sentence translation mode
- Phase 5: Settings, light/dark theme, optional AI provider slot, error handling, installer signing
