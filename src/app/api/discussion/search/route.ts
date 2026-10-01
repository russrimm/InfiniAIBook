import { NextResponse } from "next/server";
import { z } from "zod";
import { noSourcesSelected } from "@/lib/http";
import { notebookTitle, searchForDiscussion } from "@/lib/discussionServer";
import { discussionFail } from "@/lib/discussionHttp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  notebookId: z.string().min(1).max(64),
  sourceIds: z.array(z.string().max(64)).max(1000).optional(),
  query: z.string().trim().min(1).max(300),
  /** Number for the first new excerpt. */
  start: z.number().int().min(1).max(100_000),
  /** Excerpts the AI already has, so they keep their numbers. */
  known: z
    .array(z.object({ passageId: z.string().max(64), n: z.number().int().positive() }))
    .max(2000)
    .default([]),
});

/** search_sources, called by the browser on the AI's behalf during a live discussion. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const { notebookId, sourceIds } = parsed.data;
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    if (!notebookTitle(notebookId)) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    return NextResponse.json(await searchForDiscussion(parsed.data));
  } catch (e) {
    return discussionFail(e);
  }
}
