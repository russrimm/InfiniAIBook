import { NextResponse } from "next/server";
import { budgetStatus } from "@/lib/budget";
import { bookendBlockers } from "@/lib/bookendbuild";
import { bookendEstimate, bookendRequest, bookendStatus, normalizeBookends, BOOKEND_SLOTS } from "@/lib/bookends";
import { hostIsRendering, jobKey, loadHost, writeBookends } from "@/lib/bookendroute";
import { cueClipState } from "@/lib/trainingclips";
import { fail, ok } from "@/lib/http";
import { videoStatus } from "@/lib/videoproviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The intro and outro of a training video or motion explainer, with what the
 * editor needs to show them: whether each is ready, the running generation, the
 * estimated cost of what is still to be made, and the daily budget.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bookends = normalizeBookends(host.content.bookends);
    const status = videoStatus();
    const caps = status.configured ? status.capabilities : null;
    const slots = Object.fromEntries(
      BOOKEND_SLOTS.map((slot) => {
        const request = caps ? bookendRequest(bookends[slot], caps) : null;
        return [
          slot,
          {
            status: bookendStatus(slot, bookends[slot], caps && request ? { model: caps.model, req: request } : undefined),
            request,
            job: cueClipState(id, jobKey(slot)),
          },
        ];
      }),
    );
    return ok({
      kind: host.type,
      bookends,
      slots,
      problems: bookendBlockers(id, bookends),
      estimate: caps ? bookendEstimate(caps, bookends) : null,
      mainSeconds: typeof host.content.durationSec === "number" ? host.content.durationSec : null,
      rendering: hostIsRendering(host),
      video: status,
      budget: budgetStatus(),
    });
  } catch (e) {
    return fail(e);
  }
}

/** Save the settings: `{ intro, outro, fade }`. Refused while the video is rendering, so a render never changes under itself. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hostIsRendering(host)) {
      return NextResponse.json({ error: "The video is rendering. Wait for it to finish before changing the intro or outro." }, { status: 409 });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Send a JSON object.", code: "invalid" }, { status: 400 });
    }
    const next = normalizeBookends(body);
    // The clips are only ever changed by making, choosing or removing one: the settings never carry them.
    // `clear` names the slots whose clip to let go of.
    const stored = normalizeBookends(host.content.bookends);
    const clear = new Set(Array.isArray(body.clear) ? body.clear.map(String) : []);
    for (const slot of BOOKEND_SLOTS) {
      delete next[slot].clipId;
      delete next[slot].clipSeconds;
      delete next[slot].clipKey;
      delete next[slot].label;
      if (!clear.has(slot) && stored[slot].clipId) {
        const { clipId, clipSeconds, clipKey, label } = stored[slot];
        Object.assign(next[slot], { clipId, clipSeconds, clipKey, label });
      }
    }
    return ok({ bookends: writeBookends(id, next) });
  } catch (e) {
    return fail(e);
  }
}
