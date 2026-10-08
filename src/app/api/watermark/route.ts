import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { listWatermarkImages, saveWatermarkImage } from "@/lib/watermark";
import { MAX_WATERMARK_BYTES } from "@/lib/watermarkchoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The watermark image library offered on the video Studio formats. */
export async function GET() {
  try {
    return ok({ images: listWatermarkImages(), maxBytes: MAX_WATERMARK_BYTES });
  } catch (e) {
    return fail(e);
  }
}

/** Upload one image as `{ name, dataUrl }`; the browser converts it to PNG first. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; dataUrl?: unknown };
    const image = saveWatermarkImage(body.name, body.dataUrl);
    return ok({ image, images: listWatermarkImages() });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 413) {
      return NextResponse.json({ error: (e as Error).message }, { status });
    }
    return fail(e);
  }
}
