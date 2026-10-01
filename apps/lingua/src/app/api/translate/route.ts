import { z } from "zod";
import { LANGUAGE_CODES, language } from "@/lib/languages";
import { chatComplete } from "@/lib/server/chat";
import { error, fromError, json, readJson } from "@/lib/server/http";

export const runtime = "nodejs";

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  from: z.enum(LANGUAGE_CODES),
  to: z.enum(LANGUAGE_CODES),
});

// Partner lines repeat (greetings, "really?") and a page reload re-requests
// every gloss; a small cache spares the model both.
const cache = new Map<string, string>();
const CACHE_MAX = 500;

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await readJson(req, 16 * 1024));
    if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Invalid request.");
    const { text, from, to } = parsed.data;
    if (from === to) return json({ translation: text });

    const key = `${from}|${to}|${text}`;
    const hit = cache.get(key);
    if (hit) return json({ translation: hit });

    const translation = (
      await chatComplete(
        [
          {
            role: "system",
            content: `Translate the user's ${language(from).name} line into natural, conversational ${language(to).name}. If parts are already in ${language(to).name}, keep them. Reply with the translation only — no quotes, notes or alternatives.`,
          },
          { role: "user", content: text },
        ],
        { maxTokens: 800 }
      )
    ).trim();

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, translation);
    return json({ translation });
  } catch (e) {
    return fromError(e, "translate");
  }
}
