import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { deleteSession, getSession, sessionMessages } from "@/lib/sessions";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Chat not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = getSession(id);
    if (!session) return notFound();
    return ok({ session, messages: sessionMessages(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!getSession(id)) return notFound();
    const body = (await req.json()) as { title?: string };
    const title = body.title?.trim().slice(0, 120);
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
    db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(title, id);
    return ok({ session: getSession(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    deleteSession(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
