import fs from "node:fs";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { deleteWatermarkImage, listWatermarkImages, watermarkImageFile } from "@/lib/watermark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The stored PNG, for the picker's thumbnail. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const file = watermarkImageFile(id);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bytes = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.length),
      // Ids are never reused, so a stored image never changes.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

/** Remove an uploaded image. Videos already rendered with it keep their watermark. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!deleteWatermarkImage(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return ok({ ok: true, images: listWatermarkImages() });
  } catch (e) {
    return fail(e);
  }
}
