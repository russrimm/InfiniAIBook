import { deleteSession, getSession } from "@/lib/server/db";
import { error, fromError, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = getSession((await params).id);
    return session ? json({ session }) : error("Session not found.", 404);
  } catch (e) {
    return fromError(e, "sessions:get");
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    return deleteSession((await params).id) ? json({ ok: true }) : error("Session not found.", 404);
  } catch (e) {
    return fromError(e, "sessions:delete");
  }
}
