import { NextResponse } from "next/server";
import { assertCanAfford, budgetStatus } from "@/lib/budget";
import { fail, generationSourceError, ok } from "@/lib/http";
import { citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { estimateClipCost, NO_VIDEO_MODEL_MESSAGE, normalizeClipRequest } from "@/lib/videoclip";
import { startClipRun } from "@/lib/videoclipstore";
import { currentVideoProvider, videoStatus } from "@/lib/videoproviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether video clips are available here, what the model can do, and today's budget. */
export async function GET() {
  return ok({ ...videoStatus(), budget: budgetStatus() });
}

/**
 * Start making clips. Returns the new artifact at once; the work continues in
 * the background and the browser polls /api/artifacts/:id for progress.
 */
export async function POST(req: Request) {
  try {
    const provider = currentVideoProvider();
    if (!provider) {
      return NextResponse.json({ error: NO_VIDEO_MODEL_MESSAGE, code: "not_configured" }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Send a JSON object.", code: "invalid" }, { status: 400 });
    }
    const sourceIds = body.sourceIds as string[] | undefined;
    const none = generationSourceError(body.notebookId, sourceIds);
    if (none) return none;
    const notebookId = body.notebookId as string;

    const parsed = normalizeClipRequest(provider.capabilities(), body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: "invalid" }, { status: 400 });

    // Money is only reserved clip by clip as each is submitted; this refuses a run that could never fit.
    assertCanAfford(estimateClipCost(provider.capabilities(), parsed.value).totalCents);

    // Provenance only: the prompts were written (and edited) from these sources.
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 2000) : "";
    const focused: Passage[] = topic ? await retrieve(notebookId, topic, sourceIds, 12).catch(() => []) : [];
    const broad = sampleCorpus(notebookId, sourceIds, 12000);
    const seen = new Set(focused.map((p) => p.id));
    const passages = [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 20);

    const run = startClipRun({
      notebookId,
      request: parsed.value,
      provider,
      title: typeof body.title === "string" ? body.title.slice(0, 80) : undefined,
      sourceIds: sourceIds as string[],
      citations: citationList(passages),
    });
    return ok(run);
  } catch (e) {
    return fail(e);
  }
}
