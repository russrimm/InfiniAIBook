import fs from "node:fs";
import path from "node:path";
import { rates, speechCents, avatarCents, type Rates } from "./budget";
import { isImageStyle } from "./infographic";
import { motionSceneCount, normalizeMotionOptions } from "./motion";
import { videoDir } from "./paths";
import { AUDIO_LENGTHS, audioLength } from "./voices";
import { whiteboardSize } from "./whiteboard";

/**
 * Pre-generation cost estimates for the long-running Studio generators.
 *
 * These are estimates, not quotes. They multiply the number of provider calls
 * a generator makes by the same rough per-call prices the daily budget charges
 * (see `rates` in budget.ts; each can be changed with a PRICE_* variable), so
 * what is shown here and what is counted against DAILY_BUDGET_USD agree. Real
 * provider bills differ with your plan, model and discounts.
 */

export type CostLine = { label: string; cents: number };
export type CostEstimate = { cents: number; lines: CostLine[] };

/** Estimates this large or larger ask for confirmation first. COST_CONFIRM_USD=0 never asks. */
export function confirmAboveCents(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.COST_CONFIRM_USD;
  if (raw === undefined || raw.trim() === "") return 100;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** Characters of speech per scripted word, markup included. */
const SSML_CHARS_PER_WORD = 8;
/** Typical spoken words in one whiteboard or motion scene. */
const SCENE_WORDS = 35;
/** Sections a training script is written in, by length. */
const trainingSections = (minutes: number) => (minutes >= 10 ? 7 : minutes >= 6 ? 5 : 4);

const total = (lines: CostLine[]): CostEstimate => ({
  cents: lines.reduce((sum, l) => sum + l.cents, 0),
  lines: lines.filter((l) => l.cents > 0),
});

/** Estimated cost of generating `type` with the options the Studio sends. Null for a type this does not know. */
export function estimateGeneration(
  type: string,
  body: Record<string, unknown>,
  r: Rates = rates(),
  handCached = fs.existsSync(path.join(videoDir(), "hand-marker.png")),
): CostEstimate | null {
  const script = (label: string, calls = 1): CostLine => ({ label, cents: calls * r.studioCall });

  switch (type) {
    case "podcast": {
      const len = AUDIO_LENGTHS[audioLength(typeof body.length === "string" ? body.length : undefined)];
      const speakers = Array.isArray(body.speakers) ? Math.max(1, body.speakers.length) : 2;
      // Turns are narrated one call at a time; each call is at least the minimum charge.
      const calls = Math.max(1, Math.round((len.words * SSML_CHARS_PER_WORD) / 1000));
      return total([
        script("Writing the script (one draft and a length check)", 2),
        {
          label: `Narrating about ${len.minutes} minutes with ${speakers} voice${speakers === 1 ? "" : "s"}`,
          cents: calls * speechCents(1000, r),
        },
      ]);
    }
    case "video": {
      const scenes = whiteboardSize(body.length, body.scenes).scenes;
      return total([
        script("Writing the script"),
        { label: `Drawing ${scenes} scenes`, cents: scenes * r.image },
        { label: "Hand-drawn marker (made once, then reused)", cents: handCached ? 0 : r.image },
        { label: `Narrating ${scenes} scenes`, cents: scenes * speechCents(SCENE_WORDS * SSML_CHARS_PER_WORD, r) },
      ]);
    }
    case "motion": {
      const options = normalizeMotionOptions(body);
      const scenes = motionSceneCount(options);
      const backgrounds = Math.max(1, scenes - 1);
      const hero = options.character === "none" ? 0 : 1;
      const props = Math.ceil(scenes / 2);
      return total([
        script("Planning the scenes"),
        { label: `Artwork: ${backgrounds} backgrounds, ${hero} character, about ${props} props`, cents: (backgrounds + hero + props) * r.image },
        { label: `Narrating ${scenes} scenes`, cents: scenes * speechCents(SCENE_WORDS * SSML_CHARS_PER_WORD, r) },
      ]);
    }
    case "training": {
      const len = AUDIO_LENGTHS[audioLength(typeof body.length === "string" ? body.length : undefined)];
      const sections = trainingSections(len.minutes);
      const composition = (body.composition ?? {}) as { mode?: unknown };
      const composed = composition.mode !== "presenter";
      return total([
        script("Writing the transcript"),
        { label: `Presenter video for about ${len.minutes} minutes`, cents: avatarCents(len.words, r) },
        {
          label: `Timing the narration (${sections} sections)`,
          cents: sections * speechCents((len.words / sections) * SSML_CHARS_PER_WORD, r),
        },
        // The pictures are drawn on request; this is the most a full set would cost.
        ...(composed ? [{ label: `Pictures, if every section draws one (up to ${sections})`, cents: sections * r.image }] : []),
      ]);
    }
    case "infographic": {
      const picture = isImageStyle(typeof body.style === "string" ? body.style : undefined);
      return total([script("Writing the content"), ...(picture ? [{ label: "Drawing the picture", cents: r.image }] : [])]);
    }
    default:
      return type in KNOWN_TEXT_TYPES ? total([script("Writing it")]) : null;
  }
}

/** Studio formats that make one model call and nothing else. */
const KNOWN_TEXT_TYPES: Record<string, true> = {
  report: true,
  briefing: true,
  study_guide: true,
  faq: true,
  quiz: true,
  flashcards: true,
  mindmap: true,
  timeline: true,
  slides: true,
};
export function formatUsd(cents: number): string {
  const usd = cents / 100;
  if (usd > 0 && usd < 0.01) return "less than $0.01";
  return `$${usd.toFixed(2)}`;
}
