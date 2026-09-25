import { ok, fail } from "@/lib/http";
import { deleteNote, getNote, updateNote } from "@/lib/notes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Note not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const note = getNote(id);
    return note ? ok({ note }) : notFound();
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { title?: string; content?: string };
    const note = updateNote(id, body);
    return note ? ok({ note }) : notFound();
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    deleteNote(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
