import { NextResponse } from "next/server";
import { trainingClipPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; hash: string }> };

/** A rendered transparent presenter clip, for previewing over the visuals. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, hash } = await params;
  try {
    return serveRangedFile(req, trainingClipPath(id, hash), "video/webm");
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
