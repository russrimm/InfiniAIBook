import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { readNarration } from "@/lib/narration";
import { normalizeEditedScript, podcastSettings } from "@/lib/podcastscript";
import {
  isNarrating,
  readPodcast,
  scriptOf,
  writePodcast,
  type StoredPodcast,
} from "@/lib/podcaststore";
import { ALL_SPEAKERS, clampRate, type SpeakerId } from "@/lib/voices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Save edits to an audio-overview script and its narration settings. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const current = readPodcast(id);
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (isNarrating(current)) {
      return NextResponse.json(
        { error: "The overview is being narrated — wait for it to finish before editing." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as {
      title?: string;
      description?: string;
      script?: unknown;
      voices?: Partial<Record<SpeakerId, string>>;
      rate?: number;
      music?: unknown;
      narration?: unknown;
    };

    const speakers = current.speakers?.length
      ? current.speakers
      : (["a", "b"] as SpeakerId[]).map((sid) => ({ id: sid, voice: undefined as string | undefined }));
    const next: StoredPodcast = { ...current };
    let changed = false;

    if (typeof body.title === "string" && body.title.trim()) {
      next.title = body.title.replace(/\s+/g, " ").trim().slice(0, 120);
      changed ||= next.title !== current.title;
    }
    if (typeof body.description === "string") {
      next.description = body.description.replace(/\s+/g, " ").trim().slice(0, 300);
    }
    if (body.script !== undefined) {
      const script = normalizeEditedScript(body.script, speakers.length);
      if (!script.segments.length) {
        return NextResponse.json(
          { error: "Keep at least one line for the speakers to say." },
          { status: 400 }
        );
      }
      changed ||= JSON.stringify(script) !== JSON.stringify(scriptOf(current));
      next.script = script;
    } else if (!next.script) {
      next.script = scriptOf(current);
    }
    if (body.voices && typeof body.voices === "object") {
      next.speakers = speakers.map((s) => {
        const wanted = body.voices?.[s.id];
        const voice = typeof wanted === "string"
          ? ALL_SPEAKERS.find((v) => v.toLowerCase() === wanted.toLowerCase())
          : undefined;
        if (voice && voice !== s.voice) changed = true;
        return voice ? { ...s, voice } : s;
      });
    }
    if (body.rate !== undefined) {
      const rate = clampRate(body.rate);
      const settings = podcastSettings(current);
      changed ||= rate !== settings.rate;
      next.settings = { ...settings, rate };
    }
    if ("music" in body) {
      next.musicChoice = normalizeMusicChoice(body.music);
      changed = true;
    }
    if (body.narration !== undefined) {
      next.narration = readNarration(body.narration);
      changed = true;
    }

    if (changed && current.audioUrl) next.editedSinceNarration = true;
    writePodcast(id, next);
    return ok({ ok: true, content: next });
  } catch (e) {
    return fail(e);
  }
}
