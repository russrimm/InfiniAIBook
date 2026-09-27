import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { fail, noSourcesSelected } from "@/lib/http";
import { chatStream, describeAuthError, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieveWithDiagnostics } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { createSession, getSession, touchSession } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Longest question accepted. Sources carry the bulk text; a question need not. */
const MAX_MESSAGE_CHARS = 20_000;

/** Appended to an answer the user stopped, so the saved turn says so. */
const STOPPED_MARK = "\n\n_(Stopped before the answer was finished.)_";

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
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        {
          error: `That message is ${message.length.toLocaleString()} characters; the limit is ${MAX_MESSAGE_CHARS.toLocaleString()}. Add long text as a source instead.`,
          code: "too_long",
        },
        { status: 400 }
      );
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

    // Aborted when the reader goes away — the Stop button, a closed tab — so
    // the provider stops generating (and billing) an answer nobody will read.
    const upstream = new AbortController();
    const abort = () => upstream.abort();
    req.signal?.addEventListener("abort", abort);

    const stream = await chatStream(messages, 0.25, { signal: upstream.signal });

    // Only record the turn once the upstream call has actually started.
    db.prepare(
      "INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(userMsgId, notebookId, session.id, "user", message, null, Date.now());
    touchSession(session.id, message);

    const encoder = new TextEncoder();
    let full = "";

    /** Save what was said. A stopped answer keeps its text, marked as cut short. */
    const saveAnswer = (stopped: boolean) => {
      const used = new Set([...full.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
      const kept = citations.filter((c) => used.has(c.n));
      const cites = kept.length ? kept : citations.slice(0, 4);
      const id = nanoid(12);
      db.prepare(
        "INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at) VALUES (?,?,?,?,?,?,?)"
      ).run(
        id,
        notebookId,
        session.id,
        "assistant",
        stopped ? full + STOPPED_MARK : full,
        JSON.stringify(cites),
        Date.now()
      );
      touchSession(session.id);
      return { id, cites };
    };

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (o: unknown) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
          } catch {
            open = false; // the reader cancelled; keep going only to save
          }
        };
        let saved = false;
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
            if (upstream.signal.aborted) break;
          }
          const stopped = upstream.signal.aborted;
          if (full || !stopped) {
            const { id, cites } = saveAnswer(stopped);
            saved = true;
            send({ type: "done", id, citations: cites, stopped });
          }
        } catch (e) {
          if (upstream.signal.aborted) {
            if (full && !saved) saveAnswer(true);
          } else {
            const msg = describeAuthError(e) ?? (e instanceof Error ? e.message : "stream failed");
            send({ type: "error", error: msg });
          }
        } finally {
          req.signal?.removeEventListener("abort", abort);
          if (open) {
            try {
              controller.close();
            } catch {
              /* already cancelled */
            }
          }
        }
      },
      cancel() {
        upstream.abort();
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
