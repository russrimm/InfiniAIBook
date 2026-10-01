import { TranscriptSchema } from "@/lib/types";
import { saveTranscript } from "@/lib/server/db";
import { error, fromError, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Replace a session's transcript. POST rather than PUT so the browser can
 * also save with navigator.sendBeacon when the tab closes mid-call.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const parsed = TranscriptSchema.safeParse(await readJson(req, 4 * 1024 * 1024));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid transcript.");
    return saveTranscript((await params).id, parsed.data)
      ? json({ ok: true })
      : error("Session not found.", 404);
  } catch (e) {
    return fromError(e, "sessions:transcript");
  }
}
