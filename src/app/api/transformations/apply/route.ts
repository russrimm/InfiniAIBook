import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatText } from "@/lib/ai";
import { createNote } from "@/lib/notes";
import { buildContext, citationList, sampleCorpus } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { getTransformation } from "@/lib/transformations";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

/**
 * POST /api/transformations/apply { transformationId, sourceId }
 * Runs a transformation over one source and saves the result as an AI note
 * in the source's notebook.
 */
export async function POST(req: Request) {
  try {
    const { transformationId, sourceId } = (await req.json()) as {
      transformationId?: string;
      sourceId?: string;
    };
    const t = transformationId ? getTransformation(transformationId) : null;
    if (!t) return NextResponse.json({ error: "Unknown transformation" }, { status: 404 });
    const src = sourceId
      ? (db.prepare("SELECT id, notebook_id, title FROM sources WHERE id = ?").get(sourceId) as unknown as
          | { id: string; notebook_id: string; title: string }
          | undefined)
      : undefined;
    if (!src) return NextResponse.json({ error: "Source not found" }, { status: 404 });

    const passages = sampleCorpus(src.notebook_id, [src.id], MAX_CONTEXT_CHARS);
    if (!passages.length) {
      return NextResponse.json({ error: "That source has no text to work with." }, { status: 400 });
    }

    const content = await chatText(
      [
        {
          role: "system",
          content: `${GROUNDING_RULES}\n\nYou are applying a transformation to one source. Follow the instruction exactly and respond in Markdown.\n\nINSTRUCTION\n===========\n${t.prompt}\n\nSOURCE EXCERPTS\n===============\n${buildContext(
            passages
          )}`,
        },
        { role: "user", content: `Apply "${t.name}" to "${src.title}".` },
      ],
      0.3
    );

    const used = new Set([...content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    const note = createNote({
      notebookId: src.notebook_id,
      title: `${t.name}: ${src.title}`,
      content,
      kind: "ai",
      sourceId: src.id,
      citations: citationList(passages).filter((c) => used.has(c.n)),
    });
    return ok({ note }, 201);
  } catch (e) {
    return fail(e);
  }
}
