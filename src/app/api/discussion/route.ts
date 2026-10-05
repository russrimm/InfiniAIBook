import { NextResponse } from "next/server";
import { z } from "zod";
import { reserve } from "@/lib/budget";
import { fail, noSourcesSelected } from "@/lib/http";
import { DiscussionSetupSchema } from "@/lib/discussion";
import { buildDiscussionSession, notebookTitle, openingExcerpts, sourceTitles } from "@/lib/discussionServer";
import { discussionFail } from "@/lib/discussionHttp";
import { RealtimeUnavailableError, realtimeTarget, startRealtimeCall } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  notebookId: z.string().min(1).max(64),
  sourceIds: z.array(z.string().max(64)).max(1000).optional(),
  setup: DiscussionSetupSchema,
  sdp: z
    .string()
    .min(10)
    .max(64 * 1024)
    .refine((v) => v.startsWith("v="), "Not an SDP offer."),
});

/** Whether live discussions are configured, so the Studio card can say what's missing. */
export async function GET() {
  try {
    const t = realtimeTarget();
    return NextResponse.json({ ready: true, model: t.model });
  } catch (e) {
    if (e instanceof RealtimeUnavailableError) return NextResponse.json({ ready: false, problem: e.message });
    return fail(e);
  }
}

/** Start a live discussion: build the grounded session and exchange SDP with the realtime service. */
export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    const { notebookId, sourceIds, setup, sdp } = parsed.data;
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    const title = notebookTitle(notebookId);
    if (!title) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });

    const target = realtimeTarget();
    const excerpts = await openingExcerpts(notebookId, sourceIds, setup.focus);
    if (!excerpts.length) {
      return NextResponse.json(
        { error: "The selected sources have no text yet. Add a source first.", code: "no_sources" },
        { status: 400 }
      );
    }
    const { session, citations } = buildDiscussionSession({
      setup,
      title,
      sources: sourceTitles(notebookId, sourceIds),
      excerpts,
      target,
    });
    reserve("discussion", 20);
    const answer = await startRealtimeCall(session, sdp, target);
    return NextResponse.json({ answer, citations });
  } catch (e) {
    return discussionFail(e);
  }
}
