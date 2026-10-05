import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/http";
import { importNotebookZip } from "@/lib/notebookpack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_ZIP_BYTES = 200 * 1024 * 1024;

/** Restore a notebook exported from this app. Ids are new, so nothing is overwritten. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a notebook export (.zip)." }, { status: 400 });
    }
    if (file.size > MAX_ZIP_BYTES) {
      return NextResponse.json({ error: "That export is larger than 200 MB." }, { status: 413 });
    }
    const created = await importNotebookZip(Buffer.from(await file.arrayBuffer()));
    return ok(
      {
        ...created,
        warning:
          "Imported. Keyword search works now. Re-embed the notebook to turn semantic search back on.",
      },
      201
    );
  } catch (e) {
    return fail(e);
  }
}
