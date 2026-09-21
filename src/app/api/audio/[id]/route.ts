import { NextResponse } from "next/server";
import { audioPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves generated MP3s with byte-range support — without it, browsers cannot
 * seek within the track and Safari refuses to play at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return serveRangedFile(req, audioPath(id), "audio/mpeg");
  } catch {
    // audioPath rejects anything that is not a nanoid.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
