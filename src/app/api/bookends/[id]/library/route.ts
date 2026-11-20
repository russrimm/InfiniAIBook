import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { loadHost } from "@/lib/bookendroute";
import type { ClipContent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The finished clips in this video's notebook that can be picked as an intro or outro. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const rows = db
      .prepare("SELECT id, title, content FROM artifacts WHERE notebook_id = ? AND type = 'clip' ORDER BY created_at DESC LIMIT 50")
      .all(host.notebookId) as unknown as { id: string; title: string; content: string }[];
    const clips = rows.flatMap((r) => {
      let c: ClipContent;
      try {
        c = JSON.parse(r.content) as ClipContent;
      } catch {
        return [];
      }
      return c.clips
        .filter((k) => k.status === "completed" && k.videoUrl)
        .map((k) => ({
          artifactId: r.id,
          index: k.index,
          title: r.title,
          prompt: k.prompt,
          seconds: c.options.duration,
          videoUrl: k.videoUrl,
          posterUrl: k.posterUrl ?? null,
        }));
    });
    return ok({ clips });
  } catch (e) {
    return fail(e);
  }
}
