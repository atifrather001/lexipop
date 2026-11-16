/* LexiPop - SQLite cache, history, favorites (sql.js, pure JS/WASM - no native build) */
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { app } from "electron";
import type { WordEntry, HistoryItem, FavoriteItem } from "../shared/types";

const require = createRequire(import.meta.url);
const sqljs = require("sql.js");
const initSqlJs = sqljs.default || sqljs.initSqlJs;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(app.getPath("userData"), "lexipop.db");
const WASM_NAME = "sql-wasm.wasm";

function resolveWasm(): string {
  const candidates = [
    path.join(__dirname, WASM_NAME),
    path.join(app.getAppPath(), "node_modules", "sql.js", "dist", WASM_NAME),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // ignore
    }
  }
  return path.join(__dirname, WASM_NAME);
}

interface CachedRow {
  word: string;
  lang: string;
  data: string;
  createdAt: number;
  accessedAt: number;
}

export class LexiPopDB {
  private db: any = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    const SQL = await initSqlJs({
      locateFile: () => resolveWasm(),
    });

    let data: Buffer | undefined;
    try {
      data = await fsp.readFile(DB_PATH);
    } catch {
      // no existing database yet
    }

    this.db = data ? new SQL.Database(data) : new SQL.Database();
    this.createSchema();
    this.initialized = true;
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        word TEXT NOT NULL,
        lang TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        accessedAt INTEGER NOT NULL,
        PRIMARY KEY (word, lang)
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        lang TEXT NOT NULL,
        lookedUpAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL,
        lang TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        addedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_word ON cache(word, lang);
      CREATE INDEX IF NOT EXISTS idx_history_word ON history(word);
      CREATE INDEX IF NOT EXISTS idx_favorites_word ON favorites(word);
    `);
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const buf = Buffer.from(this.db.export());
    await fsp.writeFile(DB_PATH, buf);
  }

  /** Return cached entry or null. Updates accessedAt on hit. */
  getCache(word: string, lang: string): CachedRow | null {
    if (!this.db) return null;
    const stmt = this.db.prepare(
      "SELECT * FROM cache WHERE word = ? COLLATE NOCASE AND lang = ?"
    );
    const row = stmt.get([word, lang]) as CachedRow | undefined;
    stmt.free();
    if (!row) return null;

    // update accessedAt
    const up = this.db.prepare(
      "UPDATE cache SET accessedAt = ? WHERE word = ? AND lang = ?"
    );
    up.run([Date.now(), word, lang]);
    up.free();
    this.persist().catch(() => {});
    return row;
  }

  setCache(word: string, lang: string, data: WordEntry): void {
    if (!this.db) return;
    const json = JSON.stringify(data);
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO cache (word, lang, data, createdAt, accessedAt)
       VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run([word, lang, json, now, now]);
    stmt.free();
    this.persist().catch(() => {});
  }

  addHistory(word: string, lang: string): void {
    if (!this.db) return;
    const stmt = this.db.prepare(
      "INSERT INTO history (word, lang, lookedUpAt) VALUES (?, ?, ?)"
    );
    stmt.run([word, lang, Date.now()]);
    stmt.free();
    this.persist().catch(() => {});
  }

  getHistory(limit = 100): HistoryItem[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(
      "SELECT * FROM history ORDER BY lookedUpAt DESC LIMIT ?"
    );
    const rows = stmt.all([limit]) as HistoryItem[];
    stmt.free();
    return rows;
  }

  clearHistory(): void {
    if (!this.db) return;
    this.db.prepare("DELETE FROM history").run([]);
    this.persist().catch(() => {});
  }

  addFavorite(word: string, lang: string, tags: string[] = []): void {
    if (!this.db) return;
    const exists = this.db
      .prepare(
        "SELECT id FROM favorites WHERE word = ? COLLATE NOCASE AND lang = ?"
      )
      .get([word, lang]);
    if (exists) return;
    const stmt = this.db.prepare(
      "INSERT INTO favorites (word, lang, tags, addedAt) VALUES (?, ?, ?, ?)"
    );
    stmt.run([word, lang, JSON.stringify(tags), Date.now()]);
    stmt.free();
    this.persist().catch(() => {});
  }

  removeFavorite(word: string, lang: string): void {
    if (!this.db) return;
    this.db
      .prepare(
        "DELETE FROM favorites WHERE word = ? COLLATE NOCASE AND lang = ?"
      )
      .run([word, lang]);
    this.persist().catch(() => {});
  }

  getFavorites(): FavoriteItem[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(
      "SELECT * FROM favorites ORDER BY addedAt DESC"
    );
    const rows = stmt.all([]) as FavoriteItem[];
    stmt.free();
    return rows;
  }

  updateFavoriteTags(word: string, lang: string, tags: string[]): void {
    if (!this.db) return;
    this.db
      .prepare(
        "UPDATE favorites SET tags = ? WHERE word = ? COLLATE NOCASE AND lang = ?"
      )
      .run([JSON.stringify(tags), word, lang]);
    this.persist().catch(() => {});
  }

  close(): void {
    // sql.js keeps data in memory; already persisted on writes
    this.db = null;
    this.initialized = false;
  }
}
