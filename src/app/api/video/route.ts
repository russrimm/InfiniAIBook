import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, noSourcesSelected } from "@/lib/http";
import { keepAliveJSON } from "@/lib/keepalive";
import { studioJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { PLAN_INSTRUCTION, normalizeScenePlan } from "@/lib/whiteboard";
import { ALL_SPEAKERS } from "@/lib/voices";
import { narrationPromptBlock, readNarration } from "@/lib/narration";
import { notebookNarration } from "@/lib/narrationstore";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { replaceInScenePlan, whiteboardScenes } from "@/lib/videoscript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

type Loose = Record<string, unknown>;

/**
 * Write the scene plan and stop. The artwork, narration and render only start
 * when the user presses Render (POST /api/video/[id]/render), so the script can
 * be read and edited first.
 */
export function POST(req: Request) {
  return keepAliveJSON(() => planVideo(req));
}

async function planVideo(req: Request) {
  try {
    const body = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      voice?: string;
      narration?: unknown;
      music?: unknown;
    };
    const { notebookId, topic, sourceIds, voice } = body;

    const speaker =
      ALL_SPEAKERS.find((s) => s.toLowerCase() === (voice ?? "").toLowerCase()) ?? "Ava";
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    const narration =
      body.narration === undefined ? notebookNarration(notebookId) : readNarration(body.narration);

    const focused = topic?.trim() ? await retrieve(notebookId, topic, sourceIds, 24) : [];
    const broad = sampleCorpus(notebookId, sourceIds, MAX_CONTEXT_CHARS);
    const seen = new Set(focused.map((p) => p.id));
    const passages: Passage[] = topic?.trim()
      ? [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 45)
      : broad;

    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before making a video." },
        { status: 400 }
      );
    }

    const messages: ChatMsg[] = [
      {
        role: "system",
        content: `${GROUNDING_RULES}\n\n${PLAN_INSTRUCTION(topic?.trim() ?? "")}${narrationPromptBlock(
          narration
        )}`,
      },
      {
        role: "user",
        content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
      },
    ];

    const raw = await studioJSON<Loose>(messages, 0.6);
    const normalized = normalizeScenePlan(raw);
    if (!normalized) {
      return NextResponse.json(
        { error: "The model did not return a usable scene plan. Try again." },
        { status: 502 }
      );
    }
    const plan = replaceInScenePlan(normalized, narration.replacements);

    const id = nanoid(12);
    const content = {
      title: plan.title,
      description: plan.description,
      voice: speaker,
      plan,
      narration,
      musicChoice: normalizeMusicChoice(body.music),
      scenes: whiteboardScenes(plan),
      progress: { stage: "script", done: 0, total: plan.scenes.length },
      citations: citationList(passages),
    };

    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "video", plan.title, JSON.stringify(content), now);

    return ok({ id, type: "video", title: plan.title, content, createdAt: now });
  } catch (e) {
    return fail(e);
  }
}
