import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { removeAudio, removeImage, removeVideo } from "@/lib/paths";
import { reconcileStalledVideo } from "@/lib/videobuild";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * A single artifact, body included.
 *
 * The notebook listing omits bodies, so this is how anything that actually
 * renders one gets it — and how the video player polls progress without
 * re-fetching every artifact in the notebook each tick.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;

    // The video player polls this endpoint, so this is where a build that died
    // with its process has to be noticed — otherwise it would keep reporting
    // progress until someone reloaded the whole notebook.
    reconcileStalledVideo(id);

    const row = db
      .prepare(
        "SELECT id, notebook_id, type, title, content, created_at FROM artifacts WHERE id = ?"
      )
      .get(id) as unknown as
      | {
          id: string;
          notebook_id: string;
          type: string;
          title: string;
          content: string;
          created_at: number;
        }
      | undefined;

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return ok({
      id: row.id,
      notebookId: row.notebook_id,
      type: row.type,
      title: row.title,
      content: JSON.parse(row.content),
      createdAt: row.created_at,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT type FROM artifacts WHERE id = ?")
      .get(id) as unknown as { type?: string } | undefined;

    db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    // Audio files and generated images are named after the artifact id.
    if (row?.type === "podcast") removeAudio(id);
    if (row?.type === "infographic") removeImage(id);
    if (row?.type === "video") removeVideo(id);

    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
