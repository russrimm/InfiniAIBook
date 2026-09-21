import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { removeAudio, removeImage, removeVideo } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

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
