import { nanoid } from "nanoid";
import { db } from "./db";
import type { Citation, Note } from "./types";

type NoteRow = {
  id: string;
  notebook_id: string;
  title: string;
  content: string;
  kind: string;
  source_id: string | null;
  citations: string | null;
  created_at: number;
  updated_at: number;
};

export const MAX_NOTE_CHARS = 200_000;

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  notebookId: r.notebook_id,
  title: r.title,
  content: r.content,
  kind: r.kind === "ai" ? "ai" : "human",
  sourceId: r.source_id,
  citations: r.citations ? (JSON.parse(r.citations) as Citation[]) : undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const COLS =
  "id, notebook_id, title, content, kind, source_id, citations, created_at, updated_at";

export function listNotes(notebookId: string): Note[] {
  const rows = db
    .prepare(`SELECT ${COLS} FROM notes WHERE notebook_id = ? ORDER BY updated_at DESC`)
    .all(notebookId) as unknown as NoteRow[];
  return rows.map(toNote);
}

export function getNote(id: string): Note | null {
  const row = db.prepare(`SELECT ${COLS} FROM notes WHERE id = ?`).get(id) as unknown as
    | NoteRow
    | undefined;
  return row ? toNote(row) : null;
}

/** A short, readable title from the first line of the body. */
export function titleFrom(content: string, fallback = "Untitled note") {
  const line = content
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .find(Boolean);
  if (!line) return fallback;
  return line.length > 80 ? line.slice(0, 77) + "…" : line;
}

export function createNote(input: {
  notebookId: string;
  title?: string;
  content: string;
  kind?: "human" | "ai";
  sourceId?: string | null;
  citations?: Citation[];
}): Note {
  const now = Date.now();
  const id = nanoid(12);
  const content = input.content.slice(0, MAX_NOTE_CHARS);
  const title = input.title?.trim().slice(0, 200) || titleFrom(content);
  db.prepare(
    `INSERT INTO notes (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.notebookId,
    title,
    content,
    input.kind ?? "human",
    input.sourceId ?? null,
    input.citations?.length ? JSON.stringify(input.citations) : null,
    now,
    now
  );
  return getNote(id)!;
}

export function updateNote(id: string, patch: { title?: string; content?: string }) {
  const n = getNote(id);
  if (!n) return null;
  const title = patch.title !== undefined ? patch.title.trim().slice(0, 200) || n.title : n.title;
  const content =
    patch.content !== undefined ? patch.content.slice(0, MAX_NOTE_CHARS) : n.content;
  db.prepare("UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?").run(
    title,
    content,
    Date.now(),
    id
  );
  return getNote(id);
}

export function deleteNote(id: string) {
  db.prepare("DELETE FROM notes WHERE id = ?").run(id);
}
