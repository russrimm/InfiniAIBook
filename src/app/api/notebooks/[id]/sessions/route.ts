import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { createSession, listSessions } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function exists(id: string) {
  return !!db.prepare("SELECT 1 FROM notebooks WHERE id = ?").get(id);
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!exists(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return ok({ sessions: listSessions(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!exists(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    return ok({ session: createSession(id, body.title) }, 201);
  } catch (e) {
    return fail(e);
  }
}
