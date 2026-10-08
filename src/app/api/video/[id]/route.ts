import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { videoPath } from "@/lib/paths";
import { serveRangedFile } from "@/lib/rangefile";
import { normalizeMotionPlan, normalizeMotionOptions, type MotionPlan } from "@/lib/motion";
import { normalizeScenePlan, type ScenePlan } from "@/lib/whiteboard";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { normalizeWatermark } from "@/lib/watermarkchoice";
import { readNarration } from "@/lib/narration";
import {
  motionScenes,
  replaceInMotionPlan,
  replaceInScenePlan,
  whiteboardScenes,
} from "@/lib/videoscript";
import { ALL_SPEAKERS } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves rendered MP4s with byte-range support — without it, browsers cannot
 * seek within the video and some refuse to play it at all.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return serveRangedFile(req, videoPath(id), "video/mp4");
  } catch {
    // videoPath rejects anything that is not a nanoid.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

const BUILDING = new Set(["planning", "artwork", "narration", "rendering"]);

type Loose = Record<string, unknown>;

/**
 * Save edits to a whiteboard or motion script before (or between) renders.
 * Refused while a build is running: it already has the old script.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT type, content FROM artifacts WHERE id = ?")
      .get(id) as unknown as { type: string; content: string } | undefined;
    if (!row || (row.type !== "video" && row.type !== "motion")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = JSON.parse(row.content) as Loose & {
      plan?: ScenePlan | MotionPlan;
      progress?: { stage?: string };
      options?: unknown;
      videoUrl?: string;
    };
    if (!current.plan) {
      return NextResponse.json(
        { error: "This video was made before scripts could be edited. Generate it again to edit." },
        { status: 409 }
      );
    }
    if (BUILDING.has(current.progress?.stage ?? "")) {
      return NextResponse.json(
        { error: "The video is being built — wait for it to finish before editing." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as {
      title?: string;
      description?: string;
      scenes?: unknown[];
      voice?: string;
      music?: unknown;
      watermark?: unknown;
      narration?: unknown;
      movement?: string;
    };

    const next: Loose = { ...current };
    const narration = body.narration !== undefined
      ? readNarration(body.narration)
      : readNarration(current.narration);
    next.narration = narration;

    if (row.type === "video") {
      const base = current.plan as ScenePlan;
      const edited = normalizeScenePlan({
        title: body.title ?? base.title,
        description: body.description ?? base.description,
        scenes: body.scenes ?? base.scenes,
      });
      if (!edited) {
        return NextResponse.json(
          { error: "Keep at least two scenes, each with a title, a drawing and narration." },
          { status: 400 }
        );
      }
      const plan = replaceInScenePlan(edited, narration.replacements);
      next.plan = plan;
      next.scenes = whiteboardScenes(plan);
      next.title = plan.title;
      next.description = plan.description;
    } else {
      const base = current.plan as MotionPlan;
      const options = normalizeMotionOptions(current.options ?? {});
      const edited = normalizeMotionPlan(
        {
          title: body.title ?? base.title,
          description: body.description ?? base.description,
          style: base.style,
          scenes: body.scenes ?? base.scenes,
        },
        options
      );
      if (!edited) {
        return NextResponse.json(
          { error: "Keep at least three scenes, each with a headline and narration." },
          { status: 400 }
        );
      }
      // The look was settled when the plan was written; edits never change it.
      const plan = replaceInMotionPlan({ ...edited, style: base.style }, narration.replacements);
      next.plan = plan;
      next.scenes = motionScenes(plan);
      next.title = plan.title;
      next.description = plan.description;
    }

    if (typeof body.voice === "string") {
      const v = ALL_SPEAKERS.find((s) => s.toLowerCase() === body.voice!.toLowerCase());
      if (v) next.voice = v;
    }
    if ("music" in body) next.musicChoice = normalizeMusicChoice(body.music);
    if ("watermark" in body) next.watermarkChoice = normalizeWatermark(body.watermark);
    if (row.type === "motion" && typeof body.movement === "string") {
      const options = normalizeMotionOptions({ ...(current.options as object), movement: body.movement });
      if (options.movement !== normalizeMotionOptions(current.options ?? {}).movement) {
        next.options = options;
      }
    }

    // The rendered file no longer matches what is on screen.
    if (current.videoUrl && current.progress?.stage === "done") next.editedSinceRender = true;

    db.prepare("UPDATE artifacts SET content = ?, title = ? WHERE id = ?").run(
      JSON.stringify(next),
      String(next.title),
      id
    );
    return ok({ ok: true, content: next });
  } catch (e) {
    return fail(e);
  }
}
