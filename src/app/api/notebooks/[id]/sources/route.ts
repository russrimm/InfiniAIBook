import { nanoid } from "nanoid";
import { db, floatsToBlob } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chunkText, extractFromFile, extractFromUrl } from "@/lib/ingest";
import { fetchYouTubeTranscript, isYouTubeUrl } from "@/lib/youtube";
import { chatText, embed, describeAuthError } from "@/lib/ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

async function ingestOne(
  notebookId: string,
  title: string,
  kind: string,
  url: string | null,
  text: string,
  warnings: string[]
) {
  if (!text.trim()) throw new Error(`No readable text found in "${title}".`);

  const sourceId = nanoid(12);
  db.prepare(
    `INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sourceId, notebookId, title, kind, url, text, text.length, Date.now());

  const chunks = chunkText(text);
  const insert = db.prepare(
    `INSERT INTO chunks (id, source_id, notebook_id, idx, text, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  let vectors: number[][] | null = null;
  try {
    vectors = await embed(chunks);
  } catch (e) {
    console.warn("[ingest] embeddings unavailable, keyword search only:", e);
    const detail =
      describeAuthError(e) ?? (e instanceof Error ? e.message : "embedding call failed");
    warnings.push(`Semantic search is disabled — ${detail}`);
  }

  chunks.forEach((c, i) => {
    insert.run(
      nanoid(12),
      sourceId,
      notebookId,
      i,
      c,
      vectors ? floatsToBlob(vectors[i]) : null
    );
  });

  // Best-effort summary — never block ingestion on it.
  try {
    const summary = await chatText(
      [
        {
          role: "system",
          content:
            "Summarise the document in 2 sentences (max 45 words). Plain text, no preamble.",
        },
        { role: "user", content: text.slice(0, 12000) },
      ],
      0.2
    );
    if (summary) {
      db.prepare("UPDATE sources SET summary = ? WHERE id = ?").run(
        summary,
        sourceId
      );
    }
  } catch {
    /* ignore */
  }

  return { id: sourceId, title, kind, chars: text.length, chunks: chunks.length };
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: notebookId } = await params;
    const exists = db
      .prepare("SELECT id, title FROM notebooks WHERE id = ?")
      .get(notebookId) as unknown as { id: string; title: string } | undefined;
    if (!exists) return NextResponse.json({ error: "Notebook not found" }, { status: 404 });

    const added: unknown[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const ctype = req.headers.get("content-type") ?? "";

    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      for (const f of files) {
        try {
          const ex = await extractFromFile(f);
          added.push(
            await ingestOne(notebookId, ex.title, ex.kind, null, ex.text, warnings)
          );
        } catch (e) {
          errors.push(`${f.name}: ${e instanceof Error ? e.message : "failed"}`);
        }
      }
    } else {
      const body = (await req.json()) as {
        url?: string;
        text?: string;
        title?: string;
      };
      if (body.url) {
        try {
          if (isYouTubeUrl(body.url)) {
            const yt = await fetchYouTubeTranscript(body.url);
            if (yt.warning) warnings.push(yt.warning);
            added.push(
              await ingestOne(
                notebookId,
                body.title || yt.title,
                yt.kind,
                body.url,
                yt.text,
                warnings
              )
            );
          } else {
            const ex = await extractFromUrl(body.url);
            added.push(
              await ingestOne(
                notebookId,
                body.title || ex.title,
                "url",
                body.url,
                ex.text,
                warnings
              )
            );
          }
        } catch (e) {
          // No URL prefix: a URL request carries exactly one source, and the
          // client already shows which one failed.
          errors.push(e instanceof Error ? e.message : "Could not fetch that URL.");
        }
      } else if (body.text) {
        try {
          added.push(
            await ingestOne(
              notebookId,
              body.title || "Pasted text",
              "text",
              null,
              body.text,
              warnings
            )
          );
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "failed");
        }
      }
    }

    if (!added.length) {
      return NextResponse.json(
        { error: errors.join("; ") || "Nothing was added." },
        { status: 400 }
      );
    }

    // Auto-name the notebook from its first source.
    if (exists.title === "Untitled notebook") {
      const count = db
        .prepare("SELECT COUNT(*) AS c FROM sources WHERE notebook_id = ?")
        .get(notebookId) as unknown as { c: number };
      if (count.c === added.length) {
        const first = added[0] as { title: string };
        const name = first.title.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
        db.prepare("UPDATE notebooks SET title = ? WHERE id = ?").run(name, notebookId);
      }
    }

    return ok({ added, errors, warnings: [...new Set(warnings)] });
  } catch (e) {
    return fail(e);
  }
}
