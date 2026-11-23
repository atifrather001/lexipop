/* LexiPop - SQLite cache, history, favorites (sql.js, pure JS/WASM - no native build) */
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { app } from "electron";
import type { WordEntry, HistoryItem, FavoriteItem, EncyclopediaEntry } from "../shared/types";

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
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS encyclopedia (
        term TEXT NOT NULL COLLATE NOCASE,
        lang TEXT NOT NULL,
        data TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (term, lang)
      );
    `);
  }

  /** sql.js has no all(): step through the statement and collect rows as objects. */
  private allRows<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
    } finally {
      stmt.free();
    }
    return rows;
  }

  /** First row as an object, or null. (sql.js get() returns an array, not an object.) */
  private oneRow<T>(sql: string, params: unknown[] = []): T | null {
    return this.allRows<T>(sql, params)[0] ?? null;
  }

  private async persist(): Promise<void> {
    if (!this.db) return;
    const buf = Buffer.from(this.db.export());
    await fsp.writeFile(DB_PATH, buf);
  }

  /** Return cached entry or null. Updates accessedAt on hit. */
  getCache(word: string, lang: string): CachedRow | null {
    if (!this.db) return null;
    const row = this.oneRow<CachedRow>(
      "SELECT * FROM cache WHERE word = ? COLLATE NOCASE AND lang = ?",
      [word, lang]
    );
    if (!row) return null;

    // update accessedAt
    const up = this.db.prepare(
      "UPDATE cache SET accessedAt = ? WHERE word = ? COLLATE NOCASE AND lang = ?"
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

  /** Most recent lookups, one row per word+language (latest time wins). */
  getHistory(limit = 100): HistoryItem[] {
    if (!this.db) return [];
    return this.allRows<HistoryItem>(
      `SELECT MAX(id) AS id, word, lang, MAX(lookedUpAt) AS lookedUpAt
         FROM history
        GROUP BY lower(word), lang
        ORDER BY lookedUpAt DESC
        LIMIT ?`,
      [limit]
    );
  }

  clearHistory(): void {
    if (!this.db) return;
    this.db.run("DELETE FROM history");
    this.persist().catch(() => {});
  }

  addFavorite(word: string, lang: string, tags: string[] = []): void {
    if (!this.db) return;
    const exists = this.oneRow<{ id: number }>(
      "SELECT id FROM favorites WHERE word = ? COLLATE NOCASE AND lang = ?",
      [word, lang]
    );
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
    this.db.run("DELETE FROM favorites WHERE word = ? COLLATE NOCASE AND lang = ?", [word, lang]);
    this.persist().catch(() => {});
  }

  getFavorites(): FavoriteItem[] {
    if (!this.db) return [];
    const rows = this.allRows<Omit<FavoriteItem, "tags"> & { tags: string }>(
      "SELECT * FROM favorites ORDER BY addedAt DESC"
    );
    return rows.map((r) => {
      let tags: string[] = [];
      try {
        const parsed: unknown = JSON.parse(r.tags);
        if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === "string");
      } catch {
        // bad tags JSON: treat as none
      }
      return { ...r, tags };
    });
  }

  updateFavoriteTags(word: string, lang: string, tags: string[]): void {
    if (!this.db) return;
    this.db.run("UPDATE favorites SET tags = ? WHERE word = ? COLLATE NOCASE AND lang = ?", [
      JSON.stringify(tags),
      word,
      lang,
    ]);
    this.persist().catch(() => {});
  }

  /* ---- Encyclopedia cache ("null" data = no article found, cached as a miss) ---- */

  getEncyclopedia(term: string, lang: string): { data: string; createdAt: number } | null {
    if (!this.db) return null;
    const row = this.oneRow<{ data?: string; createdAt?: number }>(
      "SELECT data, createdAt FROM encyclopedia WHERE term = ? COLLATE NOCASE AND lang = ?",
      [term, lang]
    );
    if (!row || typeof row.data !== "string" || typeof row.createdAt !== "number") return null;
    return { data: row.data, createdAt: row.createdAt };
  }

  setEncyclopedia(term: string, lang: string, data: EncyclopediaEntry | null): void {
    if (!this.db) return;
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO encyclopedia (term, lang, data, createdAt) VALUES (?, ?, ?, ?)"
    );
    stmt.run([term, lang, JSON.stringify(data), Date.now()]);
    stmt.free();
    this.persist().catch(() => {});
  }

  /* ---- small key/value store (e.g. last exchange-rate table for offline use) ---- */

  getMeta(key: string): string | null {
    if (!this.db) return null;
    return this.oneRow<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key])?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    if (!this.db) return;
    this.db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
    this.persist().catch(() => {});
  }

  close(): void {
    // sql.js keeps data in memory; already persisted on writes
    this.db = null;
    this.initialized = false;
  }
}
