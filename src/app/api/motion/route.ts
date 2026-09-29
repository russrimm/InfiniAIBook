import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, noSourcesSelected } from "@/lib/http";
import { studioJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import {
  MOTION_PLAN_INSTRUCTION,
  MOTION_RESOLUTIONS,
  normalizeMotionOptions,
  normalizeMotionPlan,
} from "@/lib/motion";
import { buildMotionVideo, musicAvailable } from "@/lib/motionbuild";
import { setProgress } from "@/lib/videobuild";
import { ALL_SPEAKERS } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

/** Whether the Studio card should offer a music bed. */
export async function GET() {
  return ok({ music: musicAvailable() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      voice?: string;
      music?: boolean;
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
    };
    const { notebookId, topic, sourceIds, voice, music } = body;
    const options = normalizeMotionOptions(body);

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
        content: `${GROUNDING_RULES}\n\n${MOTION_PLAN_INSTRUCTION(topic?.trim() ?? "", options)}`,
      },
      {
        role: "user",
        content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
      },
    ];

    const raw = await studioJSON<Record<string, unknown>>(messages, 0.7);
    const plan = normalizeMotionPlan(raw, options);
    if (!plan) {
      return NextResponse.json(
        { error: "The model did not return a usable scene plan. Try again." },
        { status: 502 }
      );
    }

    const withMusic = Boolean(music) && musicAvailable();
    const id = nanoid(12);
    const content = {
      title: plan.title,
      description: plan.description,
      voice: speaker,
      music: withMusic,
      options,
      scenes: plan.scenes.map((s) => ({
        title: s.headline,
        caption: s.subline,
        narration: s.narration,
        beat: s.beat,
      })),
      progress: { stage: "artwork", done: 0, total: plan.scenes.length },
      citations: citationList(passages),
    };

    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "motion", plan.title, JSON.stringify(content), now);

    // Deliberately not awaited: assets alone run for minutes. The row carries
    // progress, so the client watches it rather than holding a request open.
    const { width, height } = MOTION_RESOLUTIONS[options.resolution];
    void buildMotionVideo(id, plan, speaker, { music: withMusic, width, height }).catch((e) => {
      console.error("[motion] build failed", e);
      setProgress(id, {
        progress: {
          stage: "failed",
          done: 0,
          total: plan.scenes.length,
          note: e instanceof Error ? e.message : "The build failed.",
        },
      });
    });

    return ok({ id, notebookId, type: "motion", title: plan.title, content, createdAt: now });
  } catch (e) {
    return fail(e);
  }
}
