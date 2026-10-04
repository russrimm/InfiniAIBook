import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { loadTraining } from "@/lib/trainingroute";
import { drawTrainingPicture } from "@/lib/trainingpictures";
import { compositionPalette, normalizeComposition } from "@/lib/trainingvisuals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Draw an illustration for an image cue. Called on demand — from the cue
 * editor, or while preparing a render for cues that still have none — so
 * nothing is generated (or billed) for a cue the user deletes.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.replace(/\s+/g, " ").trim().slice(0, 600) : "";
    if (!prompt) return NextResponse.json({ error: "Describe the picture first." }, { status: 400 });

    const pal = compositionPalette(normalizeComposition(t.content.composition));
    const imageId = await drawTrainingPicture(prompt, pal);
    return ok({ imageId, url: `/api/image/${imageId}` });
  } catch (e) {
    return fail(e);
  }
}
