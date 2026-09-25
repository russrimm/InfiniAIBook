import { ok, fail } from "@/lib/http";
import { createTransformation, listTransformations, TransformationInputError } from "@/lib/transformations";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ transformations: listTransformations() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; description?: string; prompt?: string };
    return ok({ transformation: createTransformation(body) }, 201);
  } catch (e) {
    if (e instanceof TransformationInputError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return fail(e);
  }
}
