import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/http";
import { importNotebookZip } from "@/lib/notebookpack";
import { BODY_OVERHEAD_BYTES, MAX_NOTEBOOK_ZIP_BYTES, readLimitedForm } from "@/lib/bodylimits";
import { mb } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TOO_LARGE = `That export is larger than ${mb(MAX_NOTEBOOK_ZIP_BYTES)}, the most an import accepts. Export the notebook again without its largest sources, or split it into two notebooks.`;

/** Restore a notebook exported from this app. Ids are new, so nothing is overwritten. */
export async function POST(req: Request) {
  try {
    const form = await readLimitedForm(req, MAX_NOTEBOOK_ZIP_BYTES + BODY_OVERHEAD_BYTES, TOO_LARGE);
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a notebook export (.zip)." }, { status: 400 });
    }
    if (file.size > MAX_NOTEBOOK_ZIP_BYTES) {
      return NextResponse.json({ error: TOO_LARGE, code: "too_large" }, { status: 413 });
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
