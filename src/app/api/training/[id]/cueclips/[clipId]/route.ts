import { NextResponse } from "next/server";
import { trainingCueClipPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clipId: string }> };

/** A generated clip for one visual of a training video, with byte ranges so the editor can scrub it. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, clipId } = await params;
  try {
    return serveRangedFile(req, trainingCueClipPath(id, clipId, "mp4"), "video/mp4");
  } catch {
    // The path helpers reject anything that is not a nanoid.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
