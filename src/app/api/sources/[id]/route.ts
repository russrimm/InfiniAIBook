import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT id, title, kind, url, text, chars, summary FROM sources WHERE id = ?")
      .get(id) as unknown as
      | {
          id: string;
          title: string;
          kind: string;
          url: string | null;
          text: string;
          chars: number;
          summary: string | null;
        }
      | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    db.prepare("DELETE FROM sources WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
