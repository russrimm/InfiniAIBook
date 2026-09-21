import { NextResponse } from "next/server";
import { videoPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves rendered MP4s with byte-range support — without it, browsers cannot
 * seek within the video and some refuse to play it at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return serveRangedFile(req, videoPath(id), "video/mp4");
  } catch {
    // videoPath rejects anything that is not a nanoid.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
