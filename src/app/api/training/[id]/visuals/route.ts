import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { isRendering } from "@/lib/trainingbuild";
import { loadTraining, saveTrainingContent } from "@/lib/trainingroute";
import { planTrainingVisuals } from "@/lib/trainingplan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Plan the visuals again: for the whole video, or one section with `{ section }`
 * (0-based). Replaces the cues it plans; the transcript is untouched.
 */
export async function POST(req: Request, { params }: Ctx) {
  const started = Date.now();
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (isRendering(t.content)) {
      return NextResponse.json(
        { error: "The video is rendering — wait for it to finish before changing the visuals." },
        { status: 409 }
      );
    }
    const body = (await req.json().catch(() => ({}))) as { section?: unknown };
    const n = Number(body.section);
    const only = body.section === undefined || body.section === null ? undefined : n;
    if (only !== undefined && (!Number.isInteger(only) || only < 0 || only >= t.content.sections.length)) {
      return NextResponse.json({ error: "No such section." }, { status: 400 });
    }

    // Pictures are found while there is time left in the request; the rest at render.
    const cues = await planTrainingVisuals(t.notebookId, t.content, only, { pictureDeadline: started + 200_000 });
    const next = {
      ...t.content,
      sections: t.content.sections.map((s, i) => {
        const { cues: _old, ...rest } = s;
        void _old;
        return cues[i]?.length ? { ...rest, cues: cues[i] } : rest;
      }),
      progress: { ...t.content.progress, note: undefined },
    };
    if (next.videoUrl) next.editedSinceRender = true;
    saveTrainingContent(id, next);
    return ok({ ok: true, content: next });
  } catch (e) {
    return fail(e);
  }
}
