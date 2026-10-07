import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, noSourcesSelected } from "@/lib/http";
import { keepAliveJSON } from "@/lib/keepalive";
import { studioJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import {
  MOTION_PLAN_INSTRUCTION,
  normalizeMotionOptions,
  normalizeMotionPlan,
} from "@/lib/motion";
import { musicAvailable } from "@/lib/music";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { narrationPromptBlock, readNarration } from "@/lib/narration";
import { notebookNarration } from "@/lib/narrationstore";
import { motionScenes, replaceInMotionPlan } from "@/lib/videoscript";
import { ALL_SPEAKERS } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

/** Whether any background-music track is available. Kept for older clients. */
export async function GET() {
  return ok({ music: musicAvailable() });
}

/**
 * Write the scene plan and stop. Artwork, narration and animation only start
 * when the user presses Render (POST /api/video/[id]/render).
 */
export function POST(req: Request) {
  return keepAliveJSON(() => planMotion(req));
}

async function planMotion(req: Request) {
  try {
    const body = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      voice?: string;
      /** { track, volume }; `true` from older clients means a random track. */
      music?: unknown;
      narration?: unknown;
      // Customization; see normalizeMotionOptions for the accepted values.
      length?: string;
      tone?: string;
      audience?: string;
      visual?: string;
      palette?: string | Record<string, string>;
      customPalette?: Record<string, string>;
      character?: string;
      characterDescription?: string;
      closing?: string;
      resolution?: string;
      movement?: string;
    };
    const { notebookId, topic, sourceIds, voice, music } = body;
    const options = normalizeMotionOptions(body);
    const narration =
      body.narration === undefined ? notebookNarration(notebookId) : readNarration(body.narration);
    const musicChoice =
      music === true ? { track: "random", volume: "medium" as const } : normalizeMusicChoice(music);

    const speaker =
      ALL_SPEAKERS.find((s) => s.toLowerCase() === (voice ?? "").toLowerCase()) ?? "Ava";
    const none = noSourcesSelected(sourceIds);
    if (none) return none;

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
        content: `${GROUNDING_RULES}\n\n${MOTION_PLAN_INSTRUCTION(
          topic?.trim() ?? "",
          options
        )}${narrationPromptBlock(narration)}`,
      },
      {
        role: "user",
        content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
      },
    ];

    const raw = await studioJSON<Record<string, unknown>>(messages, 0.7);
    const normalized = normalizeMotionPlan(raw, options);
    if (!normalized) {
      return NextResponse.json(
        { error: "The model did not return a usable scene plan. Try again." },
        { status: 502 }
      );
    }
    const plan = replaceInMotionPlan(normalized, narration.replacements);

    const id = nanoid(12);
    const content = {
      title: plan.title,
      description: plan.description,
      voice: speaker,
      music: false,
      musicChoice,
      narration,
      options,
      plan,
      scenes: motionScenes(plan),
      progress: { stage: "script", done: 0, total: plan.scenes.length },
      citations: citationList(passages),
    };

    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "motion", plan.title, JSON.stringify(content), now);

    return ok({ id, notebookId, type: "motion", title: plan.title, content, createdAt: now });
  } catch (e) {
    return fail(e);
  }
}
