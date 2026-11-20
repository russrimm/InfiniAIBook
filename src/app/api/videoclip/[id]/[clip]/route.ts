import { NextResponse } from "next/server";
import { clipPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clip: string }> };

/** A generated clip, with byte-range support so browsers can seek and Safari will play it. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, clip } = await params;
  try {
    return serveRangedFile(req, clipPath(id, Number(clip), "mp4"), "video/mp4");
  } catch {
    // clipPath rejects anything that is not a nanoid and a small whole number.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
