import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

/**
 * Serve a file on disk with HTTP byte-range support.
 *
 * Ranges matter for more than seeking: Safari will not play audio served
 * without them at all. Bytes are streamed straight off disk rather than read
 * whole and sliced — a browser scrubbing a ten-minute audio overview issues a
 * range request per seek, and reading the entire file each time multiplies
 * memory and disk traffic by the number of seeks.
 */
export function serveRangedFile(
  req: Request,
  file: string,
  contentType: string
): NextResponse {
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const size = fs.statSync(file).size;
  const headers: Record<string, string> = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  };

  const stream = (start: number, end: number) =>
    Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;

  const range = req.headers.get("range");
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;

  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "content-range": `bytes */${size}` },
      });
    }
    return new NextResponse(stream(start, end), {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  return new NextResponse(stream(0, size - 1), {
    status: 200,
    headers: { ...headers, "content-length": String(size) },
  });
}
