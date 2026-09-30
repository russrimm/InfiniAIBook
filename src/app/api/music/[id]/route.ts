import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { deleteTrack, listTracks, trackFile } from "@/lib/music";
import { serveRangedFile } from "@/lib/rangefile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Stream a track so the picker can preview it. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const found = trackFile(id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return serveRangedFile(req, found.file, found.contentType);
}

/** Remove an uploaded track. Tracks from MOTION_MUSIC_DIR are never deleted. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!deleteTrack(id)) {
      return NextResponse.json(
        { error: "Only tracks uploaded in the app can be deleted." },
        { status: 404 }
      );
    }
    return ok({ ok: true, tracks: listTracks() });
  } catch (e) {
    return fail(e);
  }
}
