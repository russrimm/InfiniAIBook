import fs from "node:fs";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { imageDir, imagePath } from "@/lib/paths";
import { loadTraining, pngFromDataUrl } from "@/lib/trainingroute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Screenshots are full-resolution captures; keep a generous but finite limit. */
const MAX_BYTES = 15 * 1_048_576;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Store a picture for a training video: an uploaded or pasted image, a screen
 * capture or a logo. The browser converts every source to PNG first, so the
 * server only ever accepts and serves one verified format.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!loadTraining(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { dataUrl?: unknown };
    const png = pngFromDataUrl(body.dataUrl, MAX_BYTES);
    const imageId = nanoid(12);
    fs.mkdirSync(imageDir(), { recursive: true });
    fs.writeFileSync(imagePath(imageId), png);
    return ok({ imageId, url: `/api/image/${imageId}` });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 413) {
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
    return fail(e);
  }
}
