import { NextResponse } from "next/server";
import { clipPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; clip: string }> };

/** The still the provider made of a clip, when it made one. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, clip } = await params;
  try {
    return serveRangedFile(req, clipPath(id, Number(clip), "jpg"), "image/jpeg");
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
