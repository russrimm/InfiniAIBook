import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { analyze, requestDetail } from "@/lib/explore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/sources/:id/structure
 * Discovers the structure of a JSON, HAR, XML, CSV or TSV source. With
 * ?request=<n> it returns the headers, cookies and bodies of one HAR request.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db.prepare("SELECT kind, text FROM sources WHERE id = ?").get(id) as unknown as
      | { kind: string; text: string }
      | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      const requestParam = new URL(req.url).searchParams.get("request");
      if (requestParam !== null) {
        const index = Number(requestParam);
        const detail = Number.isInteger(index) && index >= 0 ? requestDetail(row.text, row.kind, index) : null;
        if (!detail) return NextResponse.json({ error: "Request not found." }, { status: 404 });
        return ok(detail);
      }
      return ok(analyze(row.text, row.kind));
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      return NextResponse.json(
        { error: /not JSON, XML/.test(message) ? message : `This source could not be parsed: ${message || "invalid data"}` },
        { status: 422 }
      );
    }
  } catch (e) {
    return fail(e);
  }
}
