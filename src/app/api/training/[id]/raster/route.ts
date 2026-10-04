import fs from "node:fs";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { trainingRasterPath, trainingVisualsDir } from "@/lib/paths";
import { composeInput, missingRasters } from "@/lib/trainingbuild";
import { rasterJobs } from "@/lib/trainingtimeline";
import { loadTraining, pngFromDataUrl } from "@/lib/trainingroute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1_048_576;

type Ctx = { params: Promise<{ id: string }> };

/** Which visuals the compositor still needs the browser to draw. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return ok({ missing: missingRasters(id, t.content) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Store one drawn visual. Only keys the saved video actually uses are
 * accepted, so this cannot be used to fill the disk with arbitrary files.
 */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { key?: unknown; state?: unknown; dataUrl?: unknown };
    const job = rasterJobs(composeInput(t.content)).find((j) => j.key === body.key);
    const state = Number(body.state);
    if (!job || !Number.isInteger(state) || state < 0 || state >= job.states) {
      return NextResponse.json(
        { error: "That visual is not part of the saved video. Save your changes first." },
        { status: 409 }
      );
    }
    let png: Buffer;
    try {
      png = pngFromDataUrl(body.dataUrl, MAX_BYTES);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 400 });
    }
    fs.mkdirSync(trainingVisualsDir(id), { recursive: true });
    fs.writeFileSync(trainingRasterPath(id, job.key, state), png);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
