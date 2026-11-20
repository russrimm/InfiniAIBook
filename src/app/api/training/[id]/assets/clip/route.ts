import { NextResponse } from "next/server";
import { budgetStatus } from "@/lib/budget";
import { fail, ok } from "@/lib/http";
import { isRendering } from "@/lib/trainingbuild";
import { CueClipBusyError, cancelCueClip, cueClipState, startCueClip } from "@/lib/trainingclips";
import { loadTraining } from "@/lib/trainingroute";
import { NO_VIDEO_MODEL_MESSAGE, VideoClipError } from "@/lib/videoclip";
import { currentVideoProvider } from "@/lib/videoproviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CUE_ID = /^[a-z0-9]{4,16}$/;
const cueIdOf = (v: unknown): string | null => (typeof v === "string" && CUE_ID.test(v) ? v : null);

/** Where a visual's clip is: the state of the job started for it, or null when none was. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!loadTraining(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const cueId = cueIdOf(new URL(req.url).searchParams.get("cueId"));
    if (!cueId) return NextResponse.json({ error: "cueId is required." }, { status: 400 });
    return ok({ state: cueClipState(id, cueId), budget: budgetStatus() });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Make a video clip for one visual: `{ cueId, prompt, aspect?, seconds?, resolution? }`,
 * or `{ cueId, cancel: true }` to stop one. Only on request, so nothing is billed for a
 * visual the person deletes, and never as a side effect of planning or rendering.
 * Returns at once; poll GET for progress.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const cueId = cueIdOf(body?.cueId);
    if (!body || !cueId) return NextResponse.json({ error: "cueId is required.", code: "invalid" }, { status: 400 });

    if (body.cancel === true) return ok({ cancelled: cancelCueClip(id, cueId) });

    const provider = currentVideoProvider();
    if (!provider) return NextResponse.json({ error: NO_VIDEO_MODEL_MESSAGE, code: "not_configured" }, { status: 400 });
    if (isRendering(t.content)) {
      return NextResponse.json({ error: "The video is rendering. Wait for it to finish before making a clip." }, { status: 409 });
    }
    try {
      return ok({ state: startCueClip({ trainingId: id, cueId, provider, body }) });
    } catch (e) {
      if (e instanceof CueClipBusyError) return NextResponse.json({ error: e.message, code: "busy" }, { status: 409 });
      if (e instanceof VideoClipError) return NextResponse.json({ error: e.message, code: "invalid" }, { status: 400 });
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}
