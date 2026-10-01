/**
 * Session history in SQLite (Node's built-in node:sqlite, no native build).
 * A session row holds the setup; the transcript, corrections, vocabulary and
 * recap are stored as JSON because they are always read and written whole.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Setup } from "../setup";
import {
  RecapSchema,
  TranscriptSchema,
  type Recap,
  type SessionDetail,
  type SessionSummary,
  type Transcript,
} from "../types";

const globalForDb = globalThis as unknown as { __linguaDb?: DatabaseSync };

function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), ".data");
}

function init(): DatabaseSync {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "lingua.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      target TEXT NOT NULL,
      support TEXT NOT NULL,
      level TEXT NOT NULL,
      scenario TEXT NOT NULL,
      persona TEXT NOT NULL,
      learner_name TEXT,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      turn_count INTEGER NOT NULL DEFAULT 0,
      transcript_json TEXT NOT NULL DEFAULT '',
      recap_json TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_created ON sessions(created_at DESC);
  `);
  return db;
}

function db(): DatabaseSync {
  if (!globalForDb.__linguaDb) globalForDb.__linguaDb = init();
  return globalForDb.__linguaDb;
}

type Row = {
  id: string;
  created_at: number;
  ended_at: number | null;
  target: string;
  support: string;
  level: string;
  scenario: string;
  persona: string;
  learner_name: string | null;
  duration_sec: number;
  turn_count: number;
  transcript_json: string;
  recap_json: string | null;
};

const EMPTY: Transcript = {
  turns: [],
  corrections: [],
  vocabulary: [],
  goalsDone: [],
  durationSec: 0,
  ended: false,
};

function summary(r: Row): SessionSummary {
  return {
    id: r.id,
    createdAt: r.created_at,
    endedAt: r.ended_at,
    target: r.target,
    support: r.support,
    level: r.level,
    scenario: r.scenario,
    persona: r.persona,
    durationSec: r.duration_sec,
    turnCount: r.turn_count,
    hasRecap: !!r.recap_json,
  };
}

function parseJson<T>(raw: string | null, parse: (v: unknown) => T, fallback: T): T {
  if (!raw) return fallback;
  try {
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function createSession(setup: Setup & { persona: string }): string {
  const id = nanoid(12);
  db()
    .prepare(
      `INSERT INTO sessions (id, created_at, target, support, level, scenario, persona, learner_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      Date.now(),
      setup.target,
      setup.support,
      setup.level,
      setup.scenario,
      setup.persona,
      setup.learnerName ?? null
    );
  return id;
}

export function listSessions(limit = 100): SessionSummary[] {
  const rows = db()
    .prepare(
      `SELECT * FROM sessions WHERE turn_count > 0 ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as unknown as Row[];
  return rows.map(summary);
}

export function getSession(id: string): SessionDetail | null {
  const r = db().prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as unknown as Row | undefined;
  if (!r) return null;
  return {
    ...summary(r),
    learnerName: r.learner_name,
    transcript: parseJson(r.transcript_json, (v) => TranscriptSchema.parse(v), EMPTY),
    recap: parseJson<Recap | null>(r.recap_json, (v) => RecapSchema.parse(v), null),
  };
}

/** Replace the stored transcript. Returns false when the session does not exist. */
export function saveTranscript(id: string, t: Transcript): boolean {
  const result = db()
    .prepare(
      `UPDATE sessions
         SET transcript_json = ?, duration_sec = ?, turn_count = ?,
             ended_at = CASE WHEN ? THEN COALESCE(ended_at, ?) ELSE ended_at END
       WHERE id = ?`
    )
    .run(JSON.stringify(t), t.durationSec, t.turns.length, t.ended ? 1 : 0, Date.now(), id);
  return Number(result.changes) > 0;
}

export function saveRecap(id: string, recap: Recap): void {
  db().prepare(`UPDATE sessions SET recap_json = ? WHERE id = ?`).run(JSON.stringify(recap), id);
}

export function deleteSession(id: string): boolean {
  const result = db().prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  return Number(result.changes) > 0;
}

/** For tests: drop the cached handle so a new DATA_DIR takes effect. */
export function resetDbForTests(): void {
  globalForDb.__linguaDb?.close();
  globalForDb.__linguaDb = undefined;
}
