import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { createNote, listNotes } from "@/lib/notes";
import type { Citation } from "@/lib/types";
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
    return ok({ notes: listNotes(id) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!exists(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json()) as {
      title?: string;
      content?: string;
      kind?: "human" | "ai";
      sourceId?: string;
      citations?: Citation[];
    };
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "A note needs some content." }, { status: 400 });
    }
    const note = createNote({
      notebookId: id,
      title: body.title,
      content: body.content,
      kind: body.kind === "ai" ? "ai" : "human",
      sourceId: body.sourceId ?? null,
      citations: Array.isArray(body.citations) ? body.citations : undefined,
    });
    return ok({ note }, 201);
  } catch (e) {
    return fail(e);
  }
}
