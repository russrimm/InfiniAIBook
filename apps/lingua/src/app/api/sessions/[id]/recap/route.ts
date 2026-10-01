import { resolveSetup, SetupSchema } from "@/lib/setup";
import { buildRecapMessages, fallbackRecap, targetShare } from "@/lib/recap";
import { RecapSchema } from "@/lib/types";
import { getSession, saveRecap } from "@/lib/server/db";
import { chatComplete, parseModelJson } from "@/lib/server/chat";
import { chatModel } from "@/lib/server/provider";
import { error, fromError, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** Write (or rewrite) the end-of-session recap. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const id = (await params).id;
    const session = getSession(id);
    if (!session) return error("Session not found.", 404);

    const setup = SetupSchema.parse({
      target: session.target,
      support: session.support,
      level: session.level,
      scenario: session.scenario,
      persona: session.persona,
      learnerName: session.learnerName ?? undefined,
    });
    const s = resolveSetup(setup);
    const t = session.transcript;

    let recap = fallbackRecap(s, t);
    let source: "model" | "notes" = "notes";
    if (chatModel() && t.turns.some((x) => x.role === "learner")) {
      const raw = await chatComplete(buildRecapMessages(s, t), { json: true, maxTokens: 4000 });
      const parsed = RecapSchema.safeParse(parseModelJson(raw));
      if (parsed.success) {
        // The measured share beats the model's estimate when we have one.
        recap = { ...parsed.data, targetLanguageShare: targetShare(s, t) ?? parsed.data.targetLanguageShare };
        source = "model";
      } else {
        console.warn("[recap] model reply did not match the schema; using notes", parsed.error.issues[0]);
      }
    }
    saveRecap(id, recap);
    return json({ recap, source });
  } catch (e) {
    return fromError(e, "sessions:recap");
  }
}
