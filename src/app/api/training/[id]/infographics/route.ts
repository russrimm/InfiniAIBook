import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { loadTraining } from "@/lib/trainingroute";
import { notebookInfographics } from "@/lib/trainingplan";
import { artifactSourceIds } from "@/lib/artifactsources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Only infographics grounded in this training video's source selection. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const items = notebookInfographics(t.notebookId, artifactSourceIds(t.content));
    return ok({ items });
  } catch (e) {
    return fail(e);
  }
}
