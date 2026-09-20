/**
 * Delivery shaping for synthesised dialogue.
 *
 * What is usable here was established by measurement, not by the SSML spec —
 * the service accepts markup it does not implement and returns audio anyway:
 *
 *   <break time>            works, and scales: a 2500ms break added 2.78s
 *                           against a 200ms one, on both voice families.
 *   <prosody rate>          works: 0.8 lengthens a sample by about a third.
 *   <prosody volume>        rejected outright, HTTP 400, on the multitalker.
 *   <prosody pitch>         accepted, but pitch does not change duration and
 *   <emphasis>              synthesis is not deterministic (13% run-to-run
 *   <prosody contour>       variance on identical input), so no measurement
 *                           available here can show whether they do anything.
 *   <mstts:express-as>      accepted and ignored — the voice list declares no
 *                           styles for the multitalker or for Ava.
 *   <mstts:silence>         accepted, no measurable effect.
 *
 * So only breaks are used. Nothing is built on a tag that cannot be shown to
 * work, because markup that is silently dropped looks like a working feature.
 */

/** Deterministic per-turn jitter: the same line always breathes the same way. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

const br = (ms: number) => `<break time="${Math.round(ms)}ms"/>`;

/** Openers people pause after before getting to the point. */
const OPENERS =
  /^((?:Right|Well|So|OK|Okay|Yeah|Yes|No|Exactly|Hmm|Sure|True|Look|Now|Actually|Honestly|I mean)\b[,.!]?)\s+/i;

/** Pivots that land better with a beat in front of them. */
const PIVOTS =
  /(?<=[.!?]\s)(But|However|Still|Although|Though|That said|Except|And yet|Then again)\b/g;

export type Pace = { min: number; max: number };

/**
 * Insert pauses into one turn of *already XML-escaped* text.
 *
 * Escaping first matters: doing it afterwards would encode the break tags
 * into literal angle brackets and the voice would read them out.
 */
export function addBreaths(escaped: string, intensity = 1): string {
  if (intensity <= 0) return escaped;
  const rand = seeded(escaped);
  const jitter = (min: number, max: number) =>
    (min + rand() * (max - min)) * intensity;

  let out = escaped;

  // A beat after an opening interjection — the single most recognisable
  // feature of unscripted speech.
  out = out.replace(OPENERS, (_m, opener: string) => `${opener}${br(jitter(180, 380))} `);

  // Dashes and ellipses are already pause marks in writing; the voice renders
  // them as ordinary punctuation, so the pause has to be made explicit.
  out = out.replace(/\s*—\s*/g, () => `${br(jitter(140, 260))} — `);
  out = out.replace(/\.{3}|…/g, () => `${br(jitter(220, 420))}`);

  // A short gather before changing direction.
  out = out.replace(PIVOTS, (m) => `${br(jitter(160, 300))}${m}`);

  // A beat after a question inside a turn, where the speaker is leaving room.
  out = out.replace(/\?\s+(?=[A-Z])/g, () => `? ${br(jitter(200, 360))}`);

  return out;
}

/**
 * A breath before a reply. Turn-taking in real conversation is not
 * instantaneous, and the multitalker voice runs turns together without it.
 */
export function turnLeadIn(text: string, intensity = 1): string {
  if (intensity <= 0) return "";
  const rand = seeded(text);
  // Questions get answered a little faster than statements get agreed with.
  const base = /\?\s*$/.test(text) ? 90 : 150;
  return br((base + rand() * 220) * intensity);
}
