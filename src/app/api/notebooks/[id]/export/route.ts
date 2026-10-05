import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { exportNotebookZip } from "@/lib/notebookpack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Download one notebook as a zip another InfiniAIBook can import. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const packed = await exportNotebookZip(id);
    if (!packed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(packed.buffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${packed.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
