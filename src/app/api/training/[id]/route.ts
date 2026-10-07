import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { backgroundColour, presenter, presenterVoice } from "@/lib/avatars";
import { cleanSpoken, normaliseSections } from "@/lib/training";
import { isRendering } from "@/lib/trainingbuild";
import type { TrainingContent } from "@/lib/types";
import { readNarration } from "@/lib/narration";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { normalizeWatermark } from "@/lib/watermarkchoice";
import { normalizeComposition } from "@/lib/trainingvisuals";
import { resolveVoice } from "@/lib/voicelist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Save edits to a training transcript and its presenter settings.
 *
 * Refused while a render is in flight: the job already has the old script,
 * and accepting edits then would leave the video and the transcript on screen
 * silently disagreeing.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT type, content FROM artifacts WHERE id = ?")
      .get(id) as unknown as { type: string; content: string } | undefined;
    if (!row || row.type !== "training") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const current = JSON.parse(row.content) as TrainingContent;
    if (isRendering(current)) {
      return NextResponse.json(
        { error: "The video is rendering — wait for it to finish before editing." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as Partial<{
      title: string;
      description: string;
      objectives: string[];
      sections: unknown;
      presenter: string;
      voice: string;
      voiceStyle: string | null;
      background: string;
      narration: unknown;
      music: unknown;
      watermark: unknown;
      composition: unknown;
    }>;

    const next: TrainingContent = { ...current };
    let scriptChanged = false;
    if (body.composition !== undefined) {
      const composition = normalizeComposition(body.composition);
      scriptChanged ||=
        JSON.stringify(composition) !== JSON.stringify(normalizeComposition(current.composition));
      next.composition = composition;
    }
    const layoutDefaults = normalizeComposition(next.composition);

    if (typeof body.title === "string") {
      next.title = cleanSpoken(body.title).slice(0, 120) || current.title;
    }
    if (typeof body.description === "string") {
      next.description = cleanSpoken(body.description).slice(0, 300);
    }
    if (Array.isArray(body.objectives)) {
      next.objectives = body.objectives
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 6);
    }
    if (body.sections !== undefined) {
      const sections = normaliseSections(body.sections, layoutDefaults);
      if (!sections.length) {
        return NextResponse.json(
          { error: "Keep at least one section with something to say." },
          { status: 400 }
        );
      }
      scriptChanged ||= JSON.stringify(sections) !== JSON.stringify(current.sections);
      next.sections = sections;
    }
    // Composed videos show the title, description and objectives on screen.
    if (layoutDefaults.mode === "composed") {
      scriptChanged ||=
        next.title !== current.title ||
        next.description !== current.description ||
        JSON.stringify(next.objectives) !== JSON.stringify(current.objectives);
    }
    if (typeof body.presenter === "string") {
      const before = next.presenter;
      next.presenter = presenter(body.presenter).key;
      scriptChanged ||= before !== next.presenter;
    }
    if (typeof body.voice === "string" || "voiceStyle" in body) {
      const fallback = presenter(next.presenter).preset.voice;
      const [beforeVoice, beforeStyle] = [next.voice, next.voiceStyle];
      const picked = await resolveVoice(
        typeof body.voice === "string" ? presenterVoice(body.voice, fallback) : next.voice,
        "voiceStyle" in body ? body.voiceStyle : next.voiceStyle,
        fallback
      );
      next.voice = picked.voice;
      if (picked.style) next.voiceStyle = picked.style;
      else delete next.voiceStyle;
      scriptChanged ||= beforeVoice !== next.voice || beforeStyle !== next.voiceStyle;
    }
    if (typeof body.background === "string") {
      const before = next.background;
      next.background = backgroundColour(body.background);
      scriptChanged ||= before !== next.background;
    }
    if (body.narration !== undefined) {
      next.narration = readNarration(body.narration);
      scriptChanged ||=
        JSON.stringify(next.narration) !== JSON.stringify(readNarration(current.narration));
    }
    if ("music" in body) {
      next.musicChoice = normalizeMusicChoice(body.music);
      scriptChanged ||=
        JSON.stringify(next.musicChoice) !== JSON.stringify(current.musicChoice ?? null);
    }
    if ("watermark" in body) {
      next.watermarkChoice = normalizeWatermark(body.watermark);
      scriptChanged ||=
        JSON.stringify(next.watermarkChoice) !== JSON.stringify(current.watermarkChoice ?? null);
    }
    // The existing video no longer matches what is on screen.
    if (scriptChanged && current.videoUrl) next.editedSinceRender = true;

    db.prepare("UPDATE artifacts SET content = ?, title = ? WHERE id = ?").run(
      JSON.stringify(next),
      next.title,
      id
    );
    return ok({ ok: true, content: next });
  } catch (e) {
    return fail(e);
  }
}
