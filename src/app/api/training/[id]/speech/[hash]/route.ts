import { NextResponse } from "next/server";
import { ttsCachePath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; hash: string }> };

/** Preview voice track for one section, synthesized by the timing endpoint. */
export async function GET(req: Request, { params }: Ctx) {
  const { hash } = await params;
  try {
    return serveRangedFile(req, ttsCachePath(hash, "mp3"), "audio/mpeg");
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
