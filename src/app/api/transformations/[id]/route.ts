import { ok, fail } from "@/lib/http";
import {
  deleteTransformation,
  getTransformation,
  TransformationInputError,
  updateTransformation,
} from "@/lib/transformations";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function handle(e: unknown) {
  if (e instanceof TransformationInputError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return fail(e);
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const t = getTransformation(decodeURIComponent(id));
    return t ? ok({ transformation: t }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return handle(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { name?: string; description?: string; prompt?: string };
    const t = updateTransformation(decodeURIComponent(id), body);
    return t ? ok({ transformation: t }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    return handle(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    deleteTransformation(decodeURIComponent(id));
    return ok({ ok: true });
  } catch (e) {
    return handle(e);
  }
}
