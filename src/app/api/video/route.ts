import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, retrieve, sampleCorpus, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import { PLAN_INSTRUCTION, SCENE_COUNT, type ScenePlan } from "@/lib/whiteboard";
import { buildVideo, setProgress } from "@/lib/videobuild";
import { ALL_SPEAKERS } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);

type Loose = Record<string, unknown>;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Every character reaches a voice, so markup would be read out. */
const clean = (s: string) =>
  s
    .replace(/\[\d+\](?:\[\d+\])*/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

function normalisePlan(raw: Loose): ScenePlan | null {
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .map((s) => {
      const o = s as Loose;
      const title = clean(str(o.title)).toUpperCase().slice(0, 28);
      const drawing = clean(str(o.drawing));
      const narration = clean(str(o.narration));
      if (!title || !drawing || !narration) return null;
      const step = Number(o.step);
      return {
        title,
        drawing,
        caption: clean(str(o.caption)).slice(0, 80) || title,
        narration,
        step: Number.isInteger(step) && step > 0 && step < 20 ? step : undefined,
      };
    })
    .filter(Boolean) as ScenePlan["scenes"];

  if (scenes.length < 2) return null;
  return {
    title: clean(str(raw.title, "Whiteboard video")).slice(0, 80),
    description: clean(str(raw.description)),
    // More scenes than asked for multiplies cost and running time.
    scenes: scenes.slice(0, SCENE_COUNT + 2),
  };
}

export async function POST(req: Request) {
  try {
    const { notebookId, topic, sourceIds, voice } = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      voice?: string;
    };

    const speaker =
      ALL_SPEAKERS.find((s) => s.toLowerCase() === (voice ?? "").toLowerCase()) ?? "Ava";

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
        content: `${GROUNDING_RULES}\n\n${PLAN_INSTRUCTION(topic?.trim() ?? "")}`,
      },
      {
        role: "user",
        content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
      },
    ];

    const raw = await chatJSON<Loose>(messages, 0.6);
    const plan = normalisePlan(raw);
    if (!plan) {
      return NextResponse.json(
        { error: "The model did not return a usable scene plan. Try again." },
        { status: 502 }
      );
    }

    const id = nanoid(12);
    const content = {
      title: plan.title,
      description: plan.description,
      voice: speaker,
      scenes: plan.scenes.map((s) => ({
        title: s.title,
        caption: s.caption,
        narration: s.narration,
        step: s.step,
      })),
      progress: { stage: "artwork", done: 0, total: plan.scenes.length },
      citations: citationList(passages),
    };

    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "video", plan.title, JSON.stringify(content), Date.now());

    // Deliberately not awaited: artwork alone runs for minutes. The row carries
    // progress, so the client watches it rather than holding a request open.
    void buildVideo(id, plan, speaker).catch((e) => {
      console.error("[video] build failed", e);
      setProgress(id, {
        progress: {
          stage: "failed",
          done: 0,
          total: plan.scenes.length,
          note: e instanceof Error ? e.message : "The build failed.",
        },
      });
    });

    return ok({ id, type: "video", title: plan.title, content, createdAt: Date.now() });
  } catch (e) {
    return fail(e);
  }
}
