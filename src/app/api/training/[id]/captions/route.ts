import fs from "node:fs";
import { NextResponse } from "next/server";
import { captionsPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** WebVTT captions of the last composed render, for players and LMS uploads. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  let file: string;
  try {
    file = captionsPath(id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!fs.existsSync(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(fs.readFileSync(file, "utf8"), {
    status: 200,
    headers: {
      "content-type": "text/vtt; charset=utf-8",
      "content-disposition": `inline; filename="${id}.vtt"`,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
