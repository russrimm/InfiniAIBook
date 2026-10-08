import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { keepAliveJSON } from "@/lib/keepalive";
import { studioJSON, studioModel } from "@/lib/ai";
import { parseForExplore } from "@/lib/explore";
import { summarizeHar } from "@/lib/har";
import { buildDigest, diagnosisMessages, normalizeDiagnosis } from "@/lib/hardiagnose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sources/:id/diagnose  { problem?: string }
 * Asks the studio model (the stronger reasoning model when AI_STUDIO_MODEL is
 * set, otherwise the chat model) what is likely wrong in a HAR source. Only a
 * redacted digest leaves the server, never the archive itself.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { problem?: unknown };
  const problem = typeof body.problem === "string" ? body.problem.slice(0, 600) : "";
  // A large digest can keep a reasoning model busy past an idle-proxy timeout.
  return keepAliveJSON(() => diagnose(id, problem));
}

async function diagnose(id: string, problem: string) {
  const row = db.prepare("SELECT kind, text FROM sources WHERE id = ?").get(id) as unknown as
    | { kind: string; text: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let parsed: ReturnType<typeof parseForExplore>;
  try {
    parsed = parseForExplore(row.text, row.kind);
  } catch {
    return NextResponse.json({ error: "This source could not be parsed." }, { status: 422 });
  }
  if (parsed.format !== "har") {
    return NextResponse.json({ error: "Diagnosis is available for HAR sources." }, { status: 422 });
  }

  try {
    const har = summarizeHar(parsed.data);
    const raw = await studioJSON<unknown>(diagnosisMessages(buildDigest(har, parsed.data, problem)), 0.2);
    const diagnosis = normalizeDiagnosis(raw, har.requests.length);
    if (!diagnosis.summary && !diagnosis.causes.length) {
      return NextResponse.json({ error: "The model returned no usable diagnosis. Try again." }, { status: 502 });
    }
    return ok({ diagnosis, model: studioModel() });
  } catch (e) {
    return fail(e);
  }
}
