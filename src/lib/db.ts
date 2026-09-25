import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const globalForDb = globalThis as unknown as { __db?: DatabaseSync };

const DB_FILE = "infiniaibook.db";
/** Name used before the project was renamed to InfiniAIBook. */
const LEGACY_DB_FILE = "opennotebook.db";

/**
 * Carry an existing database across the rename rather than silently starting
 * empty. The WAL and shared-memory sidecars move with it, or committed writes
 * still sitting in the WAL would be lost.
 */
function adoptLegacyDatabase() {
  const next = path.join(DATA_DIR, DB_FILE);
  const old = path.join(DATA_DIR, LEGACY_DB_FILE);
  if (fs.existsSync(next) || !fs.existsSync(old)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(old + suffix)) fs.renameSync(old + suffix, next + suffix);
  }
  console.log(`[db] moved ${LEGACY_DB_FILE} to ${DB_FILE}`);
}

function init(): DatabaseSync {
  adoptLegacyDatabase();
  const db = new DatabaseSync(path.join(DATA_DIR, DB_FILE));
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

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_nb ON chat_sessions(notebook_id);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'human',
      source_id TEXT,
      citations TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_nb ON notes(notebook_id);

    CREATE TABLE IF NOT EXISTS transformations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
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

  // Chat sessions. Messages written before sessions existed belong to one
  // implicit conversation per notebook, so each such notebook gets a session
  // that adopts them — nothing already said disappears from view.
  const msgCols = (db.prepare("PRAGMA table_info(messages)").all() as unknown as {
    name: string;
  }[]).map((c) => c.name);
  if (!msgCols.includes("session_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN session_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)");

  const orphaned = db
    .prepare(
      `SELECT notebook_id, MIN(created_at) AS first, MAX(created_at) AS last
         FROM messages WHERE session_id IS NULL GROUP BY notebook_id`
    )
    .all() as unknown as { notebook_id: string; first: number; last: number }[];
  for (const o of orphaned) {
    const sid = `s_${o.notebook_id}_${o.first}`;
    db.prepare(
      `INSERT OR IGNORE INTO chat_sessions (id, notebook_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sid, o.notebook_id, "Earlier conversation", o.first, o.last);
    db.prepare(
      "UPDATE messages SET session_id = ? WHERE notebook_id = ? AND session_id IS NULL"
    ).run(sid, o.notebook_id);
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
