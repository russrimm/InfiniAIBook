import { nanoid } from "nanoid";
import { db, floatsToBlob } from "@/lib/db";

/** The `{ params }` argument Next passes to a dynamic route handler. */
export const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

export function request(
  pathAndQuery: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost${pathAndQuery}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Removes every notebook; foreign keys cascade to everything that belongs to one. */
export function resetNotebooks() {
  db.exec("DELETE FROM notebooks");
}

export function seedNotebook(title = "Test notebook", liveLearn = false) {
  const id = nanoid(12);
  db.prepare("INSERT INTO notebooks (id, title, emoji, created_at, live_learn) VALUES (?, ?, ?, ?, ?)")
    .run(id, title, "📓", Date.now(), Number(liveLearn));
  return id;
}

type SourceSeed = {
  title?: string;
  kind?: string;
  url?: string | null;
  chunks?: string[];
  embedding?: number[];
  embedModel?: string;
  createdAt?: number;
  pending?: { text: string; title?: string; hash?: string };
  checkedAt?: number | null;
};

export function seedSource(notebookId: string, seed: SourceSeed = {}) {
  const id = nanoid(12);
  const chunks = seed.chunks ?? ["Alpha text about solar panels."];
  const text = chunks.join("\n\n");
  db.prepare(
    `INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at,
                          checked_at, pending_text, pending_title, pending_hash, pending_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    notebookId,
    seed.title ?? "Source",
    seed.kind ?? "text",
    seed.url ?? null,
    text,
    text.length,
    seed.createdAt ?? Date.now(),
    seed.checkedAt ?? null,
    seed.pending?.text ?? null,
    seed.pending?.title ?? null,
    seed.pending ? (seed.pending.hash ?? "pending-hash") : null,
    seed.pending ? Date.now() : null,
  );
  chunks.forEach((chunk, idx) => {
    db.prepare(
      `INSERT INTO chunks (id, source_id, notebook_id, idx, text, embedding, embed_model, embed_dims)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      nanoid(12),
      id,
      notebookId,
      idx,
      chunk,
      seed.embedding ? floatsToBlob(seed.embedding) : null,
      seed.embedding ? (seed.embedModel ?? "test-embed") : null,
      seed.embedding ? seed.embedding.length : null,
    );
  });
  return id;
}

export function seedArtifact(notebookId: string, type: string, content: unknown = {}, title = "Artifact") {
  const id = nanoid(12);
  db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, notebookId, type, title, typeof content === "string" ? content : JSON.stringify(content), Date.now());
  return id;
}

export function count(table: string, where = "1 = 1", ...args: string[]) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(...args) as unknown as { n: number };
  return row.n;
}
