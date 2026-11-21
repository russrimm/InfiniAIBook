import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/http";
import { duplicateNotebook } from "@/lib/notebookpack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Make an independent copy of a notebook, titled "<title> (copy)". */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const copy = await duplicateNotebook(id);
    if (!copy) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    return ok(copy, 201);
  } catch (e) {
    return fail(e);
  }
}
