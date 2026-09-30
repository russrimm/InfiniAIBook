import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { listTracks, saveUpload } from "@/lib/music";
import { MAX_MUSIC_BYTES } from "@/lib/musicchoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The background-music library offered on the spoken Studio formats. */
export async function GET() {
  try {
    return ok({ tracks: listTracks(), maxBytes: MAX_MUSIC_BYTES });
  } catch (e) {
    return fail(e);
  }
}

/** Upload one track as multipart form data in a field named "file". */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose an audio file to upload." }, { status: 400 });
    }
    if (file.size > MAX_MUSIC_BYTES) {
      return NextResponse.json(
        { error: `Tracks are limited to ${Math.round(MAX_MUSIC_BYTES / 1_048_576)} MB.` },
        { status: 413 }
      );
    }
    const track = saveUpload(file.name, new Uint8Array(await file.arrayBuffer()));
    return ok({ track, tracks: listTracks() });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 413) {
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
    return fail(e);
  }
}
