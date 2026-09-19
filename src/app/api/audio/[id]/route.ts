import fs from "node:fs";
import { NextResponse } from "next/server";
import { audioPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves generated MP3s with byte-range support — without it, browsers cannot
 * seek within the track and Safari refuses to play at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;

  let file: string;
  try {
    file = audioPath(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const size = fs.statSync(file).size;
  const range = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  };

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: { "content-range": `bytes */${size}` },
        });
      }
      const chunk = fs.readFileSync(file).subarray(start, end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": String(chunk.length),
        },
      });
    }
  }

  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    status: 200,
    headers: { ...baseHeaders, "content-length": String(size) },
  });
}
