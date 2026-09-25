import { ok, fail } from "@/lib/http";
import { chatText } from "@/lib/ai";
import { buildContext, searchPassages } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/search/ask { question, notebookId? }
 * One grounded answer drawn from every notebook at once. Nothing is stored:
 * this is for finding things, and the answer names the notebooks it used.
 */
export async function POST(req: Request) {
  try {
    const { question, notebookId } = (await req.json()) as {
      question?: string;
      notebookId?: string;
    };
    const q = question?.trim().slice(0, 2000);
    if (!q) return NextResponse.json({ error: "Ask a question." }, { status: 400 });

    const { hits } = await searchPassages(q, { mode: "vector", notebookId, k: 14 });
    if (!hits.length) {
      return ok({
        answer: "Nothing in your notebooks matches that question.",
        citations: [],
      });
    }

    const passages = hits.map((h) => ({
      ...h,
      sourceTitle: `${h.sourceTitle}" in notebook "${h.notebookTitle}`,
    }));
    const answer = await chatText(
      [
        {
          role: "system",
          content: `${GROUNDING_RULES}\n\nThe excerpts come from several of the user's notebooks. Answer using them, and when it helps, say which notebook a point comes from.\n\nSOURCE EXCERPTS\n===============\n${buildContext(
            passages
          )}`,
        },
        { role: "user", content: q },
      ],
      0.2
    );

    const used = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
    const citations = hits
      .map((h, i) => ({
        n: i + 1,
        notebookId: h.notebookId,
        notebookTitle: h.notebookTitle,
        sourceId: h.sourceId,
        sourceTitle: h.sourceTitle,
        part: h.idx + 1,
        snippet: h.text.slice(0, 320),
      }))
      .filter((c) => used.has(c.n));
    return ok({ answer, citations });
  } catch (e) {
    return fail(e);
  }
}
