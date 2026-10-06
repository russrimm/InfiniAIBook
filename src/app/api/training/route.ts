import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, fail, noSourcesSelected } from "@/lib/http";
import { studioJSON, type ChatMsg } from "@/lib/ai";
import { buildContext, citationList, type Passage } from "@/lib/retrieve";
import { GROUNDING_RULES } from "@/lib/studio";
import {
  TRAINING_INSTRUCTION,
  countWords,
  normaliseScript,
  researchPassages,
  type TrainingScript,
} from "@/lib/training";
import { backgroundColour, presenter, presenterVoice } from "@/lib/avatars";
import { AUDIO_LENGTHS, WORDS_PER_MINUTE, audioLength } from "@/lib/voices";
import type { TrainingContent } from "@/lib/types";
import {
  applyReplacements,
  narrationPromptBlock,
  readNarration,
} from "@/lib/narration";
import { notebookNarration } from "@/lib/narrationstore";
import { normalizeMusicChoice } from "@/lib/musicchoice";
import { normalizeComposition } from "@/lib/trainingvisuals";
import { planTrainingVisuals } from "@/lib/trainingplan";
import { resolveVoice } from "@/lib/voicelist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CONTEXT_CHARS = Number(process.env.STUDIO_CONTEXT_CHARS || 30000);
const MIN_CONTEXT_CHARS = 6000;

type Loose = Record<string, unknown>;

/**
 * Write the training transcript. Nothing is rendered here: the avatar is
 * billed per minute, so the transcript is saved for review and the video is
 * made only when the user asks for it (POST /api/training/:id/render).
 */
export async function POST(req: Request) {
  const started = Date.now();
  try {
    const body = (await req.json()) as {
      notebookId: string;
      topic?: string;
      sourceIds?: string[];
      presenter?: string;
      voice?: string;
      voiceStyle?: string;
      background?: string;
      length?: string;
      narration?: unknown;
      music?: unknown;
      composition?: unknown;
    };
    const { notebookId, sourceIds } = body;
    const none = noSourcesSelected(sourceIds);
    if (none) return none;
    const narration =
      body.narration === undefined ? notebookNarration(notebookId) : readNarration(body.narration);
    const topic = body.topic?.trim() ?? "";
    const wanted = audioLength(body.length);
    const { key: presenterKey, preset } = presenter(body.presenter);
    const { voice, style: voiceStyle } = await resolveVoice(
      presenterVoice(body.voice, preset.voice),
      body.voiceStyle,
      preset.voice
    );

    let budget = MAX_CONTEXT_CHARS;
    let passages: Passage[] = await researchPassages(notebookId, sourceIds, topic, budget);
    if (!passages.some((p) => !p.sourceId.startsWith("note:"))) {
      return NextResponse.json(
        { error: "Add at least one source before making a training video." },
        { status: 400 }
      );
    }

    const system = (note = "") =>
      `${GROUNDING_RULES}\n\n${TRAINING_INSTRUCTION(topic, wanted)}${narrationPromptBlock(
        narration
      )}${note}`;
    const user = () => `RESEARCH (source excerpts and notes)
=====================================
${buildContext(passages)}`;

    let script: TrainingScript | null = null;
    for (let attempt = 0; attempt < 4 && !script; attempt++) {
      try {
        const raw = await studioJSON<Loose>(
          [
            { role: "system", content: system() },
            { role: "user", content: user() },
          ] satisfies ChatMsg[],
          0.6
        );
        script = normaliseScript(raw);
        // One retry for a malformed draft; more is just spending tokens.
        if (!script && attempt >= 1) break;
      } catch (e) {
        // A small deployment's token-per-minute limit is the usual failure;
        // halve the research and try again rather than giving up.
        const status = (e as { status?: number })?.status;
        if (status !== 429 || budget <= MIN_CONTEXT_CHARS) throw e;
        budget = Math.max(MIN_CONTEXT_CHARS, Math.floor(budget / 2));
        passages = await researchPassages(notebookId, sourceIds, topic, budget);
      }
    }
    if (!script) {
      return NextResponse.json(
        { error: "The model did not return a usable training transcript. Try again." },
        { status: 502 }
      );
    }

    // Models overshoot or undershoot stated word budgets badly, and here the
    // length is also the bill. One correction pass with the real numbers.
    const target = AUDIO_LENGTHS[wanted].words;
    const words = countWords(script.sections);
    const ratio = words / target;
    if (ratio > 1.25 || ratio < 0.7) {
      const note = `\n\nLENGTH CORRECTION
Your previous draft was ${words} words (about ${(words / WORDS_PER_MINUTE).toFixed(
        1
      )} minutes). The target is ${target} words (${AUDIO_LENGTHS[wanted].minutes} minutes).
Rewrite it ${ratio > 1 ? "SHORTER" : "LONGER"}, keeping the same structure. ${
        ratio > 1
          ? "Cut repetition and the least important teaching point rather than the recap or knowledge check."
          : "Go deeper with more examples from the research rather than padding."
      }`;
      try {
        const retry = normaliseScript(
          await studioJSON<Loose>(
            [
              { role: "system", content: system(note) },
              { role: "user", content: user() },
            ],
            0.6
          )
        );
        if (
          retry &&
          Math.abs(countWords(retry.sections) - target) < Math.abs(words - target)
        ) {
          script = retry;
        }
      } catch {
        // A failed correction is not worth losing a usable draft over.
      }
    }

    const price = Number(process.env.AZURE_AVATAR_PRICE_PER_MINUTE);
    const id = nanoid(12);
    const replace = (s: string) => applyReplacements(s, narration.replacements);
    const composition = normalizeComposition(body.composition ?? { mode: "presenter" });
    if (composition.mode === "composed" && !composition.lowerThird.name) {
      composition.lowerThird.name = preset.label.split(/[\s·]+/)[0] ?? "";
    }
    const content: TrainingContent & { citations: ReturnType<typeof citationList> } = {
      title: replace(script.title),
      description: replace(script.description ?? ""),
      objectives: script.objectives.map(replace),
      sections: script.sections.map((s) => ({ title: replace(s.title), text: replace(s.text) })),
      presenter: presenterKey,
      voice,
      ...(voiceStyle ? { voiceStyle } : {}),
      background: backgroundColour(body.background),
      length: wanted,
      targetMinutes: AUDIO_LENGTHS[wanted].minutes,
      ...(Number.isFinite(price) && price > 0 ? { pricePerMinute: price } : {}),
      narration,
      musicChoice: normalizeMusicChoice(body.music),
      progress: { stage: "transcript" },
      composition,
      citations: citationList(passages),
    };

    if (composition.mode === "composed") {
      try {
        const cues = await planTrainingVisuals(notebookId, content, undefined, { pictureDeadline: started + 200_000 });
        content.sections = content.sections.map((s, i) => (cues[i]?.length ? { ...s, cues: cues[i] } : s));
      } catch (e) {
        // The transcript is the expensive part; visuals can be planned again from the editor.
        console.warn("[training] visual planning failed", e);
        content.progress.note =
          "The visuals could not be planned automatically. Open Visuals and choose Plan visuals to try again.";
      }
    }

    const now = Date.now();
    db.prepare(
      "INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)"
    ).run(id, notebookId, "training", content.title, JSON.stringify(content), now);

    return ok({ id, notebookId, type: "training", title: content.title, content, createdAt: now });
  } catch (e) {
    return fail(e);
  }
}
