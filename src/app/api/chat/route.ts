import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { fail } from "@/lib/http";
import { chatStream, describeAuthError, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieveWithDiagnostics } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { createSession, getSession, touchSession } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { notebookId, message, sourceIds, sessionId } = (await req.json()) as {
      notebookId: string;
      message: string;
      sourceIds?: string[];
      /** Conversation thread to continue; a new one is started when omitted. */
      sessionId?: string;
    };
    if (!notebookId || !message?.trim()) {
      return NextResponse.json({ error: "Missing notebookId or message" }, { status: 400 });
    }

    const { passages, mismatch } = await retrieveWithDiagnostics(
      notebookId,
      message,
      sourceIds,
      12
    );
    if (!passages.length) {
      return NextResponse.json(
        { error: "This notebook has no sources yet. Add one to start asking questions." },
        { status: 400 }
      );
    }

    const citations = citationList(passages);

    const existing = sessionId ? getSession(sessionId) : null;
    if (sessionId && (!existing || existing.notebookId !== notebookId)) {
      return NextResponse.json({ error: "That chat no longer exists." }, { status: 404 });
    }
    const session = existing ?? createSession(notebookId);

    const history = (
      db
        .prepare(
          `SELECT role, content FROM messages WHERE session_id = ?
           ORDER BY created_at DESC LIMIT 8`
        )
        .all(session.id) as unknown as { role: "user" | "assistant"; content: string }[]
    ).reverse();

    const userMsgId = nanoid(12);

    const messages: ChatMsg[] = [
      {
        role: "system",
        content: `${GROUNDING_RULES}\n\nAnswer the user's question using the numbered excerpts below.\nKeep answers focused (usually 2-6 short paragraphs or a bulleted list).\n\nSOURCE EXCERPTS\n===============\n${buildContext(
          passages
        )}`,
      },
      ...history.map((h) => ({ role: h.role, content: h.content }) as ChatMsg),
      { role: "user", content: message },
    ];

    const stream = await chatStream(messages, 0.25);

    // Only record the turn once the upstream call has actually started.
    db.prepare(
      "INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(userMsgId, notebookId, session.id, "user", message, null, Date.now());
    touchSession(session.id, message);

    const encoder = new TextEncoder();
    let full = "";

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        try {
          send({ type: "session", session: getSession(session.id) });
          send({ type: "citations", citations });
          if (mismatch) {
            send({
              type: "notice",
              notice:
                `${mismatch.staleChunks} of ${mismatch.totalChunks} passages were embedded with ` +
                `${mismatch.models.join(", ")}, not the current ${mismatch.currentModel}, so they ` +
                `were ranked by keyword only. Re-embed this notebook to restore semantic search.`,
            });
          }
          for await (const part of stream) {
            const delta = part.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              send({ type: "delta", v: delta });
            }
          }
          const used = new Set(
            [...full.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]))
          );
          const kept = citations.filter((c) => used.has(c.n));
          const id = nanoid(12);
          db.prepare(
            "INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at) VALUES (?,?,?,?,?,?,?)"
          ).run(
            id,
            notebookId,
            session.id,
            "assistant",
            full,
            JSON.stringify(kept.length ? kept : citations.slice(0, 4)),
            Date.now()
          );
          touchSession(session.id);
          send({ type: "done", id, citations: kept.length ? kept : citations.slice(0, 4) });
        } catch (e) {
          const msg = describeAuthError(e) ?? (e instanceof Error ? e.message : "stream failed");
          send({ type: "error", error: msg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
