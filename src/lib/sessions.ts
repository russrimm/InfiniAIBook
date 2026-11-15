import { nanoid } from "nanoid";
import { db } from "./db";
import type { ChatSession, Message } from "./types";

export const NEW_SESSION_TITLE = "New chat";

type SessionRow = {
  id: string;
  notebook_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  message_count?: number;
};

const toSession = (r: SessionRow): ChatSession => ({
  id: r.id,
  notebookId: r.notebook_id,
  title: r.title,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  messageCount: r.message_count,
});

export function listSessions(notebookId: string): ChatSession[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.notebook_id, s.title, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
         FROM chat_sessions s WHERE s.notebook_id = ?
        ORDER BY s.updated_at DESC`
    )
    .all(notebookId) as unknown as SessionRow[];
  return rows.map(toSession);
}

export function getSession(id: string): ChatSession | null {
  const row = db
    .prepare(
      "SELECT id, notebook_id, title, created_at, updated_at FROM chat_sessions WHERE id = ?"
    )
    .get(id) as unknown as SessionRow | undefined;
  return row ? toSession(row) : null;
}

export function createSession(notebookId: string, title?: string): ChatSession {
  const now = Date.now();
  const id = nanoid(12);
  const t = title?.trim().slice(0, 120) || NEW_SESSION_TITLE;
  db.prepare(
    `INSERT INTO chat_sessions (id, notebook_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, notebookId, t, now, now);
  return { id, notebookId, title: t, createdAt: now, updatedAt: now, messageCount: 0 };
}

/** The session a request without one should use: the most recent, or a new one. */
export function latestOrNewSession(notebookId: string): ChatSession {
  const row = db
    .prepare(
      `SELECT id, notebook_id, title, created_at, updated_at FROM chat_sessions
        WHERE notebook_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .get(notebookId) as unknown as SessionRow | undefined;
  return row ? toSession(row) : createSession(notebookId);
}

export function sessionMessages(sessionId: string): Message[] {
  const rows = db
    .prepare(
      `SELECT id, role, content, citations, created_at FROM messages
        WHERE session_id = ? ORDER BY created_at, rowid`
    )
    .all(sessionId) as unknown as {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations: string | null;
    created_at: number;
  }[];
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citations ? JSON.parse(m.citations) : undefined,
    createdAt: m.created_at,
  }));
}

export type TurnRow = { id: string; role: "user" | "assistant"; content: string };

/** Every turn of a session in the order it was said. */
export function sessionTurns(sessionId: string): TurnRow[] {
  return db
    .prepare(
      "SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY created_at, rowid"
    )
    .all(sessionId) as unknown as TurnRow[];
}

/** What a chat is named after its first question; see touchSession. */
const derivedTitle = (question: string) => question.replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * Discard a message and everything said after it, for edit-and-resend. A chat
 * still carrying the name derived from the edited first question is renamed
 * back to the default so the new question names it. Returns how many messages
 * were removed.
 */
export function truncateFrom(sessionId: string, messageId: string): number {
  const turns = sessionTurns(sessionId);
  const index = turns.findIndex((t) => t.id === messageId);
  if (index < 0) return 0;
  const doomed = turns.slice(index);
  for (const t of doomed) db.prepare("DELETE FROM messages WHERE id = ?").run(t.id);
  const session = getSession(sessionId);
  if (index === 0 && session && session.title === derivedTitle(doomed[0].content)) {
    db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(NEW_SESSION_TITLE, sessionId);
  }
  return doomed.length;
}

/** Bump the session so the list stays ordered by activity. */
export function touchSession(sessionId: string, firstQuestion?: string) {
  const s = getSession(sessionId);
  if (!s) return;
  // A new chat is named after the first thing asked in it, which is what
  // people scan the list for; renaming later is still possible.
  const title =
    s.title === NEW_SESSION_TITLE && firstQuestion
      ? derivedTitle(firstQuestion)
      : s.title;
  db.prepare("UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?").run(
    title,
    Date.now(),
    sessionId
  );
}

export function deleteSession(sessionId: string) {
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
  db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
}
