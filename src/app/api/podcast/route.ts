import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { chatJSON, type ChatMsg } from "@/lib/ai";
import {
  buildContext,
  citationList,
  retrieve,
  sampleCorpus,
  type Passage,
} from "@/lib/retrieve";
import { GROUNDING_RULES, PODCAST_INSTRUCTION } from "@/lib/studio";
import { synthesizeDialogue, type Turn } from "@/lib/speech";
import { clampRate, resolveVoices, VOICE_PRESETS, audioLength, AUDIO_LENGTHS, WORDS_PER_MINUTE } from "@/lib/voices";
import { audioDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);
const MIN_CONTEXT_CHARS = 6000;

type Script = {
  title?: unknown;
  description?: unknown;
  turns?: unknown;
  segments?: unknown;
};

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Strip anything the model may have slipped in that a voice would read aloud. */
function cleanSpoken(text: string): string {
  return (
    text
      .replace(/\[\d+\](?:\[\d+\])*/g, "")
      // Stage directions. The prompt forbids them, but a model trained on
      // recording scripts still reaches for [MUSIC] and (laughs) — and the
      // voice reads them out, word for word, as part of the dialogue.
      .replace(/\[(?:[A-Z][A-Z \-]{1,18}(?::[^\]]*)?)\]/g, "")
      .replace(/\((?:laughs?|chuckles?|sighs?|pauses?|beat|music|sfx)[^)]*\)/gi, "")
      .replace(/[*_`#>]/g, "")
      .replace(/\((?:https?:\/\/|www\.)[^)]*\)/gi, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/\s{2,}/g, " ")
      // Removing citation markers leaves gaps like "bacteria ." — close them up.
      .replace(/\s+([.,!?;:])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Flatten the script to turns, remembering where each segment starts.
 *
 * Segment titles become the chapters offered in the player, so the boundary
 * has to survive flattening. Older scripts have a flat `turns` array and no
 * segments; they still play, just without chapters.
 */
function readScript(script: Script): { turns: Turn[]; marks: { title: string; index: number }[] } {
  const marks: { title: string; index: number }[] = [];
  const texts: string[] = [];

  const push = (raw: unknown) => {
    const o = raw as { text?: unknown };
    const text = cleanSpoken(str(o.text));
    if (text) texts.push(text);
  };

  if (Array.isArray(script.segments) && script.segments.length) {
    for (const seg of script.segments) {
      const s = seg as { title?: unknown; turns?: unknown };
      const title = cleanSpoken(str(s.title)).slice(0, 60);
      const before = texts.length;
      for (const t of Array.isArray(s.turns) ? s.turns : []) push(t);
      // A segment that produced nothing should not leave a chapter marker
      // pointing at the next segment's first line.
      if (title && texts.length > before) marks.push({ title, index: before });
    }
  }
  if (!texts.length && Array.isArray(script.turns)) {
    for (const t of script.turns) push(t);
  }

  return {
    turns: texts.map((text, i) => ({ speaker: i % 2 === 0 ? "a" : "b", text })),
    marks,
  };
}

const countWords = (turns: Turn[]) =>
  turns.reduce((n, t) => n + (t.text.match(/\S+/g)?.length ?? 0), 0);

/**
 * Cut a script down to a word budget, keeping the opening and the last two
 * turns. Speakers are reassigned by position afterwards, so removing turns
 * from the middle cannot leave one voice talking to itself.
 *
 * Returns which original positions survived, so chapter markers can be moved
 * with them rather than left pointing at whatever now sits at that index.
 */
function trimToWords(
  turns: Turn[],
  target: number
): { turns: Turn[]; kept: number[] } {
  if (turns.length <= 4) return { turns, kept: turns.map((_, i) => i) };
  const tailFrom = turns.length - 2;
  const tailWords = countWords(turns.slice(tailFrom));

  const kept: number[] = [];
  let used = tailWords;
  for (let i = 0; i < tailFrom; i++) {
    const w = turns[i].text.match(/\S+/g)?.length ?? 0;
    if (used + w > target && kept.length >= 2) break;
    kept.push(i);
    used += w;
  }
  kept.push(tailFrom, tailFrom + 1);

  return {
    turns: kept.map((orig, i) => ({
      ...turns[orig],
      speaker: i % 2 === 0 ? ("a" as const) : ("b" as const),
    })),
    kept,
  };
}

export async function POST(req: Request) {
  try {
    const { notebookId, topic, sourceIds, preset, voices: customVoices, rate, breath, length } =
      (await req.json()) as {
        notebookId: string;
        topic?: string;
        sourceIds?: string[];
        preset?: keyof typeof VOICE_PRESETS;
        voices?: { a?: string; b?: string };
        rate?: number;
        breath?: number;
        length?: string;
      };

    const wanted = audioLength(length);

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

    let script: Script | null = null;
    let lastError: unknown;
    /** Fed back into the next attempt when a draft misses the running time. */
    let lengthNote = "";

    for (let attempt = 0; attempt < 4; attempt++) {
      const messages: ChatMsg[] = [
        {
          role: "system",
          content: `${GROUNDING_RULES}\n\n${PODCAST_INSTRUCTION(topic?.trim() ?? "", {
            audioLength: wanted,
          })}${lengthNote}`,
        },
        {
          role: "user",
          content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
        },
      ];
      try {
        script = await chatJSON<Script>(messages, 0.7);
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

    let parsed = readScript(script);
    let turns = parsed.turns;
    if (turns.length < 2) {
      return NextResponse.json(
        { error: "The model did not return a usable dialogue. Try again." },
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
      lengthNote = `\n\nLENGTH CORRECTION
Your previous draft was ${words} words, which runs about ${minutes.toFixed(
        1
      )} minutes. The target is ${AUDIO_LENGTHS[wanted].minutes} minutes, which is ${targetWords} words.
Rewrite it ${ratio > 1 ? "SHORTER" : "LONGER"} — you were ${
        ratio > 1 ? (ratio).toFixed(1) : (1 / ratio).toFixed(1)
      } times ${ratio > 1 ? "too long" : "too short"}.
${
  ratio > 1
    ? "Cover the same ground in fewer words: cut repetition, drop the least important thread entirely, and keep turns tighter. Do not simply delete the ending."
    : "Go deeper rather than padding: take on more of the material, follow the implications further, and let the hosts disagree at more length."
}
Count the words in your answer before returning it.`;

      try {
        const retry = await chatJSON<Script>(
          [
            {
              role: "system",
              content: `${GROUNDING_RULES}\n\n${PODCAST_INSTRUCTION(
                topic?.trim() ?? "",
                { audioLength: wanted }
              )}${lengthNote}`,
            },
            {
              role: "user",
              content: `SOURCE EXCERPTS\n===============\n${buildContext(passages)}`,
            },
          ],
          0.7
        );
        const nextParsed = readScript(retry);
        const next = nextParsed.turns;
        // Only take the rewrite if it actually moved towards the target.
        if (
          next.length >= 2 &&
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

    const voices = resolveVoices(preset, customVoices);
    const speed = clampRate(rate);
    // Pause shaping is a multiplier so it can be turned off entirely without
    // a separate code path.
    const breathiness = Number.isFinite(breath)
      ? Math.min(2, Math.max(0, breath as number))
      : 1;
    const { audio, durationSec, offsets } = await synthesizeDialogue(
      turns,
      voices,
      speed,
      6,
      breathiness
    );

    const id = nanoid(12);
    fs.mkdirSync(audioDir(), { recursive: true });
    fs.writeFileSync(path.join(audioDir(), `${id}.mp3`), audio);

    const content = {
      title: cleanSpoken(str(script.title, "Audio overview")).slice(0, 120),
      description: cleanSpoken(str(script.description)),
      turns: turns.map((t, i) => ({ ...t, at: Number(offsets[i].toFixed(2)) })),
      audioUrl: `/api/audio/${id}`,
      durationSec: Number(durationSec.toFixed(2)),
      voices: { a: voices.a, b: voices.b },
      rate: speed,
      length: wanted,
      targetMinutes: AUDIO_LENGTHS[wanted].minutes,
      chapters: marks.map((m) => ({
        title: m.title,
        at: Number((offsets[m.index] ?? 0).toFixed(2)),
      })),
      citations: citationList(passages),
    };

    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "podcast", content.title, JSON.stringify(content), Date.now());

    return ok({
      id,
      type: "podcast",
      title: content.title,
      content,
      createdAt: Date.now(),
    });
  } catch (e) {
    return fail(e);
  }
}
