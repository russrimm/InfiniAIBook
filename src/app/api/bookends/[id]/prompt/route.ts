import { NextResponse } from "next/server";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import { BOOKEND_PROMPT_INSTRUCTION, DEFAULT_BOOKEND_SECONDS, parseBookendPrompt } from "@/lib/bookends";
import { loadHost, slotOf } from "@/lib/bookendroute";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

const words = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

/** What the video says, for the subject of the clip: the start of its script. */
function excerptOf(c: Record<string, unknown>): string {
  const parts: string[] = [];
  const sections = c.sections as { text?: string }[] | undefined;
  const scenes = c.scenes as { narration?: string; caption?: string }[] | undefined;
  for (const s of sections ?? []) parts.push(words(s.text));
  for (const s of scenes ?? []) parts.push(words(s.narration) || words(s.caption));
  return parts.filter(Boolean).join(" ").slice(0, 1500);
}

/**
 * Draft a prompt for an intro or outro from the video's title and script:
 * `{ slot, seconds? }`. Costs one chat call; the clip itself costs nothing yet.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const slot = slotOf(body?.slot);
    if (!body || !slot) return NextResponse.json({ error: "slot must be intro or outro.", code: "invalid" }, { status: 400 });
    const seconds = Math.min(15, Math.max(3, Math.floor(Number(body.seconds) || DEFAULT_BOOKEND_SECONDS)));

    const c = host.content;
    const options = (c.options ?? {}) as { tone?: string };
    const messages: ChatMsg[] = [
      {
        role: "system",
        content: BOOKEND_PROMPT_INSTRUCTION({
          slot,
          title: words(c.title) || "Untitled video",
          description: words(c.description) || undefined,
          excerpt: excerptOf(c as Record<string, unknown>),
          style: words(options.tone) || undefined,
          seconds,
        }),
      },
      { role: "user", content: `Write the ${slot} prompt.` },
    ];
    const prompt = parseBookendPrompt(await chatJSON<unknown>(messages, 0.8));
    if (!prompt) return NextResponse.json({ error: "The model did not return a usable prompt. Try again." }, { status: 502 });
    return ok({ prompt });
  } catch (e) {
    return fail(e);
  }
}
