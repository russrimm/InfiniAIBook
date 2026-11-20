import { NextResponse } from "next/server";
import { bookendKey, bookendRequest, normalizeBookendSetting, DEFAULT_BOOKEND_SECONDS } from "@/lib/bookends";
import { hostIsRendering, jobKey, loadHost, readBookends, slotOf, updateSlot } from "@/lib/bookendroute";
import { bookendClipPath } from "@/lib/paths";
import { budgetStatus } from "@/lib/budget";
import { fail, ok } from "@/lib/http";
import { CueClipBusyError, cancelCueClip, cueClipState, startCueClip } from "@/lib/trainingclips";
import { NO_VIDEO_MODEL_MESSAGE, VideoClipError } from "@/lib/videoclip";
import { currentVideoProvider } from "@/lib/videoproviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The generation started for a slot: its state, or null when none was. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!loadHost(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const slot = slotOf(new URL(req.url).searchParams.get("slot"));
    if (!slot) return NextResponse.json({ error: "slot must be intro or outro.", code: "invalid" }, { status: 400 });
    return ok({ state: cueClipState(id, jobKey(slot)), budget: budgetStatus() });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Make the clip for a slot: `{ slot, prompt, seconds?, resolution? }`, or
 * `{ slot, cancel: true }`. Only on request: rendering never generates a clip,
 * so re-rendering the video never bills again. Returns at once; poll GET.
 * The finished clip is recorded on the video even if nobody is watching.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const slot = slotOf(body?.slot);
    if (!body || !slot) return NextResponse.json({ error: "slot must be intro or outro.", code: "invalid" }, { status: 400 });

    if (body.cancel === true) return ok({ cancelled: cancelCueClip(id, jobKey(slot)) });

    const provider = currentVideoProvider();
    if (!provider) return NextResponse.json({ error: NO_VIDEO_MODEL_MESSAGE, code: "not_configured" }, { status: 400 });
    if (hostIsRendering(host)) {
      return NextResponse.json({ error: "The video is rendering. Wait for it to finish before making a clip." }, { status: 409 });
    }

    const wanted = normalizeBookendSetting({ mode: "ai", prompt: body.prompt, seconds: body.seconds ?? DEFAULT_BOOKEND_SECONDS, resolution: body.resolution });
    if (!wanted.prompt) return NextResponse.json({ error: "Write a prompt first.", code: "invalid" }, { status: 400 });
    const caps = provider.capabilities();
    const request = bookendRequest(wanted, caps);
    const key = bookendKey(slot, wanted, caps.model, request);

    try {
      const state = startCueClip({
        trainingId: id,
        cueId: jobKey(slot),
        provider,
        body: { prompt: wanted.prompt, aspect: request.aspect, seconds: request.duration, resolution: request.resolution },
        pathFor: (clipId, ext) => bookendClipPath(id, clipId, ext),
        onCompleted: (clipId, seconds) => {
          updateSlot(id, slot, (s) =>
            s.mode === "ai" && s.prompt === wanted.prompt
              ? { ...s, clipId, clipSeconds: seconds, clipKey: key, label: "Generated with AI" }
              : s,
          );
        },
      });
      // The settings the clip is being made from; the clip itself is added when it finishes.
      updateSlot(id, slot, (s) => ({
        ...s,
        mode: "ai",
        prompt: wanted.prompt,
        seconds: request.duration,
        resolution: request.resolution,
      }));
      return ok({ state, bookends: readBookends(id) });
    } catch (e) {
      if (e instanceof CueClipBusyError) return NextResponse.json({ error: e.message, code: "busy" }, { status: 409 });
      if (e instanceof VideoClipError) return NextResponse.json({ error: e.message, code: "invalid" }, { status: 400 });
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}
