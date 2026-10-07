import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, noSourcesSelected } from "@/lib/http";
import { keepAliveJSON } from "@/lib/keepalive";
import { studioJSON, type ChatMsg } from "@/lib/ai";
import {
  buildContext,
  citationList,
  retrieve,
  sampleCorpus,
  type Passage,
} from "@/lib/retrieve";
import { GROUNDING_RULES, PODCAST_INSTRUCTION } from "@/lib/studio";
import {
  clampRate,
  resolveVoices,
  VOICE_PRESETS,
  audioLength,
  AUDIO_LENGTHS,
  WORDS_PER_MINUTE,
  type SpeakerId,
} from "@/lib/voices";
import {
  applyReplacements,
  narrationPromptBlock,
  readNarration,
} from "@/lib/narration";
import { notebookNarration } from "@/lib/narrationstore";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import {
  cleanSpoken,
  countWords,
  readScript,
  readSpeakerProfiles,
  str,
  toSegments,
  trimToWords,
  type RawScript,
  type SpeakerInput,
} from "@/lib/podcastscript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);
const MIN_CONTEXT_CHARS = 6000;

/**
 * Write an audio-overview script and stop. Nothing is narrated until the user
 * has reviewed it and pressed Narrate (POST /api/podcast/[id]/narrate).
 */
export function POST(req: Request) {
  return keepAliveJSON(() => writePodcast(req));
}

async function writePodcast(req: Request) {
  try {
    const body = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      preset?: keyof typeof VOICE_PRESETS;
      voices?: Partial<Record<SpeakerId, string>>;
      speakers?: SpeakerInput[];
      rate?: number;
      breath?: number;
      length?: string;
      narration?: unknown;
      music?: unknown;
    };
    const {
      notebookId,
      topic,
      sourceIds,
      preset,
      voices: customVoices,
      speakers: speakerInput,
      rate,
      breath,
      length,
    } = body;

    const wanted = audioLength(length);
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    const narration =
      body.narration === undefined ? notebookNarration(notebookId) : readNarration(body.narration);
    const profiles = readSpeakerProfiles(speakerInput, customVoices);
    // Fail before the script is written if these voices cannot be narrated.
    resolveVoices(
      preset,
      Object.fromEntries(profiles.map((s) => [s.id, s.voice])) as Partial<Record<SpeakerId, string>>,
      profiles.length
    );
    const promptSpeakers = profiles.map(({ id, name, role }) => ({ id, name, role }));
    const podcastOpts = { audioLength: wanted, podcastSpeakers: promptSpeakers };
    const steer = narrationPromptBlock(narration);

    const focused = topic?.trim()
      ? await retrieve(notebookId, topic, sourceIds, 24)
      : [];

    const collect = (budget: number): Passage[] => {
      if (topic?.trim()) {
        const broad = sampleCorpus(notebookId, sourceIds, Math.round(budget * 0.4));
        const seen = new Set(focused.map((p) => p.id));
        return [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 45);
      }
      return sampleCorpus(notebookId, sourceIds, budget);
    };

    let budget = MAX_CONTEXT_CHARS;
    let passages = collect(budget);
    if (!passages.length) {
      return NextResponse.json(
        { error: "Add at least one source before generating an audio overview." },
        { status: 400 }
      );
    }

    const system = (lengthNote = "") =>
      `${GROUNDING_RULES}\n\n${PODCAST_INSTRUCTION(topic?.trim() ?? "", podcastOpts)}${steer}${lengthNote}`;

    let script: RawScript | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      const messages: ChatMsg[] = [
        { role: "system", content: system() },
        {
          role: "user",
          content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
        },
      ];
      try {
        script = await studioJSON<RawScript>(messages, 0.7);
        break;
      } catch (e) {
        lastError = e;
        const status = (e as { status?: number })?.status;
        if (status !== 429 || budget <= MIN_CONTEXT_CHARS) throw e;
        budget = Math.max(MIN_CONTEXT_CHARS, Math.floor(budget / 2));
        const next = collect(budget);
        if (!next.length) throw e;
        passages = next;
      }
    }
    if (!script) throw lastError;

    let parsed = readScript(script, profiles.length);
    let turns = parsed.turns;
    const minTurns = profiles.length === 1 ? 1 : 2;
    if (turns.length < minTurns) {
      return NextResponse.json(
        { error: "The model did not return a usable audio overview. Try again." },
        { status: 502 }
      );
    }

    /**
     * Hit the requested running time.
     *
     * Stating a word budget in the prompt is not enough on its own: asked for
     * a three minute overview the model wrote 885 words against a 480 target,
     * and for ten minutes it wrote 3,849 against 1,610 — over twice the
     * length, twice. So the draft is measured and rewritten with the actual
     * numbers quoted back, which is concrete in a way "about 1,610 words" is
     * not.
     */
    const targetWords = AUDIO_LENGTHS[wanted].words;
    for (let pass = 0; pass < 2; pass++) {
      const words = countWords(turns);
      const ratio = words / targetWords;
      if (ratio <= 1.2 && ratio >= 0.75) break;

      const minutes = words / WORDS_PER_MINUTE;
      const lengthNote = `\n\nLENGTH CORRECTION
Your previous draft was ${words} words, which runs about ${minutes.toFixed(
        1
      )} minutes. The target is ${AUDIO_LENGTHS[wanted].minutes} minutes, which is ${targetWords} words.
Rewrite it ${ratio > 1 ? "SHORTER" : "LONGER"} — you were ${
        ratio > 1 ? (ratio).toFixed(1) : (1 / ratio).toFixed(1)
      } times ${ratio > 1 ? "too long" : "too short"}.
${
  ratio > 1
    ? "Cover the same ground in fewer words: cut repetition, drop the least important thread entirely, and keep turns tighter. Do not simply delete the ending."
    : "Go deeper rather than padding: take on more of the material, follow the implications further, and let the speakers develop the ideas at more length."
}
Count the words in your answer before returning it.`;

      try {
        const retry = await studioJSON<RawScript>(
          [
            { role: "system", content: system(lengthNote) },
            {
              role: "user",
              content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
            },
          ],
          0.7
        );
        const nextParsed = readScript(retry, profiles.length);
        const next = nextParsed.turns;
        // Only take the rewrite if it actually moved towards the target.
        if (
          next.length >= minTurns &&
          Math.abs(countWords(next) - targetWords) < Math.abs(words - targetWords)
        ) {
          turns = next;
          parsed = nextParsed;
          script = retry;
        }
      } catch {
        // A failed correction is not worth failing the whole request over.
        break;
      }
    }

    // Backstop. A rewrite can still come back long, and the running time was
    // asked for explicitly, so an over-long script is trimmed rather than
    // narrated. The opening and the close are kept — cutting the tail would
    // end the conversation mid-thought.
    let marks = parsed.marks;
    if (countWords(turns) > targetWords * 1.35) {
      const trimmed = trimToWords(turns, targetWords);
      // Move each chapter to its trimmed position; a segment cut away entirely
      // loses its marker rather than pointing somewhere arbitrary.
      const moved = new Map(trimmed.kept.map((orig, now) => [orig, now]));
      marks = marks
        .map((m) => ({ ...m, index: moved.get(m.index) ?? -1 }))
        .filter((m) => m.index >= 0);
      turns = trimmed.turns;
    }

    // The replacement list is enforced on the draft too, so the editor shows
    // the words that will be spoken.
    const replace = (s: string) => applyReplacements(s, narration.replacements);
    const segments = toSegments({
      turns: turns.map((t) => ({ ...t, text: replace(t.text) })),
      marks: marks.map((m) => ({ ...m, title: replace(m.title) })),
    });

    const breathiness = Number.isFinite(breath)
      ? Math.min(2, Math.max(0, breath as number))
      : 1;

    const id = nanoid(12);
    const title = replace(cleanSpoken(str(script.title, "Audio overview"))).slice(0, 120) ||
      "Audio overview";
    const content = {
      title,
      description: replace(cleanSpoken(str(script.description))),
      stage: "script",
      script: segments,
      turns: [],
      durationSec: 0,
      voices: Object.fromEntries(profiles.map((s) => [s.id, s.voice ?? ""])),
      speakers: profiles.map(({ id, name, voice, role }) => ({ id, name, voice, role })),
      settings: {
        preset: preset === "classic" ? "classic" : "conversational",
        rate: clampRate(rate),
        breath: breathiness,
      },
      musicChoice: normalizeMusicChoice(body.music),
      narration,
      length: wanted,
      targetMinutes: AUDIO_LENGTHS[wanted].minutes,
      citations: citationList(passages),
    };

    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "podcast", content.title, JSON.stringify(content), now);

    return ok({ id, type: "podcast", title: content.title, content, createdAt: now });
  } catch (e) {
    return fail(e);
  }
}
