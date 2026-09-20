import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __db?: DatabaseSync };

function init(): DatabaseSync {
  const db = new DatabaseSync(path.join(DATA_DIR, "opennotebook.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 8000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📓',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      url TEXT,
      text TEXT NOT NULL,
      chars INTEGER NOT NULL,
      summary TEXT,
      created_at INTEGER NOT NULL,
      content_hash TEXT,
      checked_at INTEGER,
      check_error TEXT,
      pending_text TEXT,
      pending_hash TEXT,
      pending_title TEXT,
      pending_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_sources_nb ON sources(notebook_id);

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      notebook_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding BLOB,
      embed_model TEXT,
      embed_dims INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_nb ON chunks(notebook_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_src ON chunks(source_id);

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_nb ON artifacts(notebook_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_nb ON messages(notebook_id);
  `);
  migrate(db);
  return db;
}

/**
 * Additive migrations for databases created before a column existed.
 * `CREATE TABLE IF NOT EXISTS` leaves older tables untouched, so new columns
 * have to be added explicitly.
 */
function migrate(db: DatabaseSync) {
  const cols = (db.prepare("PRAGMA table_info(chunks)").all() as unknown as {
    name: string;
  }[]).map((c) => c.name);

  if (!cols.includes("embed_model")) {
    db.exec("ALTER TABLE chunks ADD COLUMN embed_model TEXT");
  }
  if (!cols.includes("embed_dims")) {
    db.exec("ALTER TABLE chunks ADD COLUMN embed_dims INTEGER");
  }

  // Change tracking for sources that came from a URL.
  const srcCols = (db.prepare("PRAGMA table_info(sources)").all() as unknown as {
    name: string;
  }[]).map((c) => c.name);

  for (const [name, type] of [
    ["content_hash", "TEXT"],
    ["checked_at", "INTEGER"],
    ["check_error", "TEXT"],
    ["pending_text", "TEXT"],
    ["pending_hash", "TEXT"],
    ["pending_title", "TEXT"],
    ["pending_at", "INTEGER"],
  ] as const) {
    if (!srcCols.includes(name)) {
      db.exec(`ALTER TABLE sources ADD COLUMN ${name} ${type}`);
    }
  }

  // Backfill rows embedded before the columns existed. Their dimension is
  // recoverable from the blob (4 bytes per float32); the model is not, so it is
  // inferred from the deployment configured at the time, which is the only
  // model that could have produced them.
  const legacy = db
    .prepare(
      "SELECT COUNT(*) AS c FROM chunks WHERE embedding IS NOT NULL AND embed_dims IS NULL"
    )
    .get() as unknown as { c: number };

  if (legacy.c > 0) {
    const assumed =
      process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";
    db.prepare(
      `UPDATE chunks
         SET embed_dims = LENGTH(embedding) / 4,
             embed_model = COALESCE(embed_model, ?)
       WHERE embedding IS NOT NULL AND embed_dims IS NULL`
    ).run(assumed);
    console.log(
      `[db] tagged ${legacy.c} existing chunk(s) as "${assumed}" from blob size`
    );
  }
}

function getDb(): DatabaseSync {
  if (!globalForDb.__db) globalForDb.__db = init();
  return globalForDb.__db;
}

/**
 * Lazily-opened handle. Opening on first *use* (rather than at import time)
 * keeps `next build` page-data collection from racing several workers onto the
 * same SQLite file.
 */
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_t, prop: string | symbol) {
    const target = getDb() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export function floatsToBlob(v: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(v).buffer);
}

export function blobToFloats(b: Uint8Array | null): Float32Array {
  if (!b) return new Float32Array(0);
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}
