import { SetupSchema, resolveSetup } from "@/lib/setup";
import { createSession, listSessions } from "@/lib/server/db";
import { error, fromError, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ sessions: listSessions() });
  } catch (e) {
    return fromError(e, "sessions:list");
  }
}

export async function POST(req: Request) {
  try {
    const parsed = SetupSchema.safeParse(await readJson(req, 8 * 1024));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid setup.");
    const resolved = resolveSetup(parsed.data);
    const id = createSession({ ...parsed.data, scenario: resolved.scenario.id, persona: resolved.persona.id });
    return json({ id }, 201);
  } catch (e) {
    return fromError(e, "sessions:create");
  }
}
