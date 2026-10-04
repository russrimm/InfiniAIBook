import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { loadTraining } from "@/lib/trainingroute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The notebook's infographics, bodies included, for infographic cues. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = loadTraining(id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = db
      .prepare(
        "SELECT id, title, content FROM artifacts WHERE notebook_id = ? AND type = 'infographic' ORDER BY created_at DESC LIMIT 20"
      )
      .all(t.notebookId) as unknown as { id: string; title: string; content: string }[];
    const items = rows.flatMap((r) => {
      try {
        return [{ id: r.id, title: r.title, content: JSON.parse(r.content) }];
      } catch {
        return [];
      }
    });
    return ok({ items });
  } catch (e) {
    return fail(e);
  }
}
