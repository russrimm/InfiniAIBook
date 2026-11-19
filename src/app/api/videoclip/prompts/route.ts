import { NextResponse } from "next/server";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import { fail, generationSourceError, ok } from "@/lib/http";
import { generationReply, type GenerationStatus } from "@/lib/keepalive";
import { buildContext, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { ASPECT_LABELS, MAX_PROMPTS, type ClipAspect } from "@/lib/videoclip";
import { CLIP_PROMPT_INSTRUCTION, normalizeClipPrompts } from "@/lib/videoclipprompt";
import { videoStatus } from "@/lib/videoproviders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

/** Draft clip prompts from the selected sources. Costs one chat call; the clips themselves cost nothing yet. */
export function POST(req: Request) {
  return generationReply(req, (report) => draft(req, report));
}

async function draft(req: Request, report: GenerationStatus) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Send a JSON object.", code: "invalid" }, { status: 400 });
    }
    const none = generationSourceError(body.notebookId, body.sourceIds);
    if (none) return none;
    const notebookId = body.notebookId as string;
    const sourceIds = body.sourceIds as string[];

    const status = videoStatus();
    const aspect = (ASPECT_LABELS[body.aspect as ClipAspect] ? body.aspect : "16:9") as ClipAspect;
    const duration = status.configured
      ? status.capabilities.durations.includes(Number(body.duration))
        ? Number(body.duration)
        : status.capabilities.durations[0]
      : 8;
    const count = Math.min(MAX_PROMPTS, Math.max(1, Math.floor(Number(body.count) || MAX_PROMPTS)));
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 2000) : "";

    report("Reading selected sources");
    const focused: Passage[] = topic ? await retrieve(notebookId, topic, sourceIds, 16) : [];
    const broad = sampleCorpus(notebookId, sourceIds, MAX_CONTEXT_CHARS);
    const seen = new Set(focused.map((p) => p.id));
    const passages = topic ? [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 30) : broad;
    if (!passages.length) {
      return NextResponse.json({ error: "Add at least one source before drafting clips." }, { status: 400 });
    }

    const messages: ChatMsg[] = [
      { role: "system", content: `${GROUNDING_RULES}\n\n${CLIP_PROMPT_INSTRUCTION(count, { aspect, duration, topic })}` },
      { role: "user", content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}` },
    ];
    report("Drafting clip ideas");
    const raw = await chatJSON<unknown>(messages, 0.8);
    const prompts = normalizeClipPrompts(raw, count);
    if (!prompts.length) {
      return NextResponse.json({ error: "The model did not return usable clip prompts. Try again." }, { status: 502 });
    }
    return ok({ prompts });
  } catch (e) {
    return fail(e);
  }
}
