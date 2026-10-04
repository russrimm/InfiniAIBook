import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { loadTraining } from "@/lib/trainingroute";
import { measureTraining, speechConfigured } from "@/lib/trainingtiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Speech timing for the preview: per section, the length, each sentence's
 * weight and a voice track — the rendered presenter clip when one exists for
 * the current words, otherwise measured text-to-speech, otherwise an estimate.
 * The first call for new words synthesizes them; later calls are cached.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { timings, note } = await measureTraining(id, t.content, { preview: true });
    return ok({ timings, note, speech: speechConfigured() });
  } catch (e) {
    return fail(e);
  }
}
