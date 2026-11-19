import { NextResponse } from "next/server";
import { bookendClipPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";
import { loadHost } from "@/lib/bookendroute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clipId: string }> };

/** An intro or outro clip, with byte ranges so the editor can scrub it; `?poster=1` for its still. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, clipId } = await params;
  try {
    if (!loadHost(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const poster = new URL(req.url).searchParams.get("poster") === "1";
    return serveRangedFile(req, bookendClipPath(id, clipId, poster ? "jpg" : "mp4"), poster ? "image/jpeg" : "video/mp4");
  } catch {
    // The path helpers reject anything that is not a nanoid.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
