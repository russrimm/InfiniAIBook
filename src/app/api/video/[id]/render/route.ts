import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import {
  MOTION_RESOLUTIONS,
  applyMovement,
  normalizeMotionOptions,
  type MotionPlan,
} from "@/lib/motion";
import { buildMotionVideo } from "@/lib/motionbuild";
import { resolveMusic } from "@/lib/music";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { readNarration } from "@/lib/narration";
import { buildVideo, setProgress } from "@/lib/videobuild";
import { replaceInMotionPlan, replaceInScenePlan } from "@/lib/videoscript";
import type { ScenePlan } from "@/lib/whiteboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const BUILDING = new Set(["planning", "artwork", "narration", "rendering"]);

/**
 * Start (or restart) the build for a reviewed whiteboard or motion script.
 * Returns at once; the player watches progress on the row.
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT type, content FROM artifacts WHERE id = ?")
      .get(id) as unknown as { type: string; content: string } | undefined;
    if (!row || (row.type !== "video" && row.type !== "motion")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const content = JSON.parse(row.content) as Record<string, unknown> & {
      plan?: ScenePlan | MotionPlan;
      progress?: { stage?: string };
      voice?: string;
      options?: unknown;
      musicChoice?: unknown;
      narration?: unknown;
    };
    if (!content.plan) {
      return NextResponse.json(
        { error: "This video was made before scripts could be edited. Generate it again." },
        { status: 409 }
      );
    }
    if (BUILDING.has(content.progress?.stage ?? "")) {
      return NextResponse.json({ error: "This video is already being built." }, { status: 409 });
    }

    const { replacements } = readNarration(content.narration);
    const voice = content.voice || "Ava";
    const music = resolveMusic(normalizeMusicChoice(content.musicChoice));
    const total = content.plan.scenes.length;

    // The previous video (if any) stays playable until the new one is done;
    // the builds render to scratch and only replace it on success.
    setProgress(id, {
      progress: { stage: "artwork", done: 0, total },
      editedSinceRender: false,
    });

    const onFail = (e: unknown) => {
      console.error(`[${row.type}] build failed`, e);
      setProgress(id, {
        progress: {
          stage: "failed",
          done: 0,
          total,
          note: e instanceof Error ? e.message : "The build failed.",
        },
      });
    };

    // Deliberately not awaited: artwork alone runs for minutes.
    if (row.type === "video") {
      const plan = replaceInScenePlan(content.plan as ScenePlan, replacements);
      void buildVideo(id, plan, voice, { music }).catch(onFail);
    } else {
      const options = normalizeMotionOptions(content.options ?? {});
      const plan = applyMovement(
        replaceInMotionPlan(content.plan as MotionPlan, replacements),
        options.movement
      );
      const { width, height } = MOTION_RESOLUTIONS[options.resolution];
      void buildMotionVideo(id, plan, voice, { music, width, height }).catch(onFail);
    }

    const fresh = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as unknown as {
      content: string;
    };
    return ok({ ok: true, content: JSON.parse(fresh.content) });
  } catch (e) {
    return fail(e);
  }
}
