import fs from "node:fs";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { generateImage } from "@/lib/ai";
import { imageDir, imagePath } from "@/lib/paths";
import { loadTraining } from "@/lib/trainingroute";
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
    const { png } = await generateImage(
      `${prompt}. Clean, modern editorial illustration for a corporate training video, ` +
        `soft lighting, uncluttered composition with room around the subject, ` +
        `color accents in ${pal.primary} and ${pal.accent}. ` +
        `No text, letters, numbers, logos or watermarks anywhere in the picture.`,
      { size: "1536x1024", quality: "medium" }
    );
    const imageId = nanoid(12);
    fs.mkdirSync(imageDir(), { recursive: true });
    fs.writeFileSync(imagePath(imageId), png);
    return ok({ imageId, url: `/api/image/${imageId}` });
  } catch (e) {
    return fail(e);
  }
}
