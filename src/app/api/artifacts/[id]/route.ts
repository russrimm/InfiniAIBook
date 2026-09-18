import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
