/**
 * Intro and outro clips for training videos and motion explainers.
 *
 * A bookend is a short video played before the first section (intro) or after
 * the last (outro). It comes from the video model (the same provider layer as
 * the Studio Video clip generator), from a clip already in the notebook library
 * or from an uploaded MP4, and is stored with the video it belongs to.
 *
 * Everything here is pure, so the editor, the render steps and the tests share
 * one implementation. Bookends are always off by default, and a render never
 * makes one: generating is a separate, confirmed step with its own cost estimate.
 */
import { hashText } from "./trainingvisuals";
import { estimateClipCost, MAX_PROMPT_CHARS, type ClipCapabilities, type ClipCostEstimate } from "./videoclip";

export const BOOKEND_SLOTS = ["intro", "outro"] as const;
export type BookendSlot = (typeof BOOKEND_SLOTS)[number];

export const BOOKEND_MODES = ["off", "ai", "library", "upload"] as const;
export type BookendMode = (typeof BOOKEND_MODES)[number];

export const BOOKEND_MODE_LABELS: Record<BookendMode, string> = {
  off: "Off",
  ai: "Generate with AI",
  library: "Use a clip from the library",
  upload: "Upload an MP4",
};

export const BOOKEND_SLOT_LABELS: Record<BookendSlot, string> = { intro: "Intro clip", outro: "Outro clip" };

export const FADES = ["cut", "short", "long"] as const;
export type BookendFade = (typeof FADES)[number];
export const FADE_LABELS: Record<BookendFade, string> = {
  cut: "Straight cut",
  short: "Short cross-fade (0.5 s)",
  long: "Long cross-fade (1 s)",
};
export const FADE_SECONDS: Record<BookendFade, number> = { cut: 0, short: 0.5, long: 1 };

/** The length asked of the video model when nothing else is chosen. */
export const DEFAULT_BOOKEND_SECONDS = 5;
export const MAX_BOOKEND_SECONDS = 60;
/** Largest uploaded bookend, in bytes. */
export const MAX_BOOKEND_UPLOAD_BYTES = 100 * 1024 * 1024;

export type BookendSetting = {
  mode: BookendMode;
  /** What the video model is asked for (mode "ai"). */
  prompt?: string;
  /** Length asked of the video model (mode "ai"). */
  seconds?: number;
  resolution?: string;
  /** The clip in this video's bookend folder, once there is one. */
  clipId?: string;
  /** Its measured length in seconds. */
  clipSeconds?: number;
  /** Fingerprint of the prompt and options the clip was made from, so a changed prompt is noticed. */
  clipKey?: string;
  /** Where it came from, shown in the editor ("Library clip", "intro.mp4"). */
  label?: string;
  /** Play the clip without its own sound. */
  mute?: boolean;
};

export type Bookends = { intro: BookendSetting; outro: BookendSetting; fade: BookendFade };

export const DEFAULT_BOOKENDS: Bookends = { intro: { mode: "off" }, outro: { mode: "off" }, fade: "short" };

const ID = /^[A-Za-z0-9_-]{1,32}$/;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function normalizeBookendSetting(raw: unknown): BookendSetting {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const mode = (BOOKEND_MODES as readonly string[]).includes(String(o.mode)) ? (o.mode as BookendMode) : "off";
  const out: BookendSetting = { mode };
  const prompt = text(o.prompt, MAX_PROMPT_CHARS);
  if (prompt) out.prompt = prompt;
  const seconds = Number(o.seconds);
  if (Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_BOOKEND_SECONDS) out.seconds = seconds;
  const resolution = text(o.resolution, 12);
  if (/^\d{3,4}p$/.test(resolution)) out.resolution = resolution;
  if (typeof o.clipId === "string" && ID.test(o.clipId)) {
    out.clipId = o.clipId;
    const length = Number(o.clipSeconds);
    if (Number.isFinite(length) && length > 0 && length <= 3600) out.clipSeconds = Math.round(length * 100) / 100;
    const key = text(o.clipKey, 24);
    if (key) out.clipKey = key;
    const label = text(o.label, 80);
    if (label) out.label = label;
  }
  if (o.mute === true) out.mute = true;
  return out;
}

export function normalizeBookends(raw: unknown): Bookends {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    intro: normalizeBookendSetting(o.intro),
    outro: normalizeBookendSetting(o.outro),
    fade: (FADES as readonly string[]).includes(String(o.fade)) ? (o.fade as BookendFade) : "short",
  };
}

export const bookendsOn = (b: Bookends | undefined): boolean => Boolean(b && (b.intro.mode !== "off" || b.outro.mode !== "off"));

/** The video-model options a bookend would be made with, resolved against what the model supports. */
export function bookendRequest(
  s: BookendSetting,
  caps: Pick<ClipCapabilities, "durations" | "defaultResolution" | "resolutions" | "aspects">,
) {
  const wanted = s.seconds ?? DEFAULT_BOOKEND_SECONDS;
  // The nearest length the model offers, preferring the shorter on a tie: never a surprise bill for more.
  const duration = [...caps.durations].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)[0];
  const resolution = caps.resolutions.some((r) => r.id === s.resolution) ? (s.resolution as string) : caps.defaultResolution;
  // The videos are 16:9; a model without it falls back to its first shape, which the render letterboxes.
  const aspect = caps.aspects.includes("16:9") ? ("16:9" as const) : caps.aspects[0];
  return { aspect, duration, resolution };
}

/** Fingerprint of everything a generated clip depends on, so re-rendering reuses it and a changed prompt is noticed. */
export function bookendKey(slot: BookendSlot, s: BookendSetting, model: string, req: { aspect: string; duration: number; resolution: string }): string {
  return hashText(JSON.stringify([slot, s.prompt ?? "", model, req.aspect, req.duration, req.resolution])).slice(0, 16);
}

export type BookendStatus = "off" | "missing" | "ready" | "stale";

/** Whether a slot is ready to render. "stale": a clip exists but its prompt or options changed since. */
export function bookendStatus(slot: BookendSlot, s: BookendSetting, current?: { model: string; req: { aspect: string; duration: number; resolution: string } }): BookendStatus {
  if (s.mode === "off") return "off";
  if (!s.clipId) return "missing";
  if (s.mode === "ai" && current && s.clipKey && s.clipKey !== bookendKey(slot, s, current.model, current.req)) return "stale";
  return "ready";
}

/** What stops a render: a requested bookend with no clip, or whose file has gone. Empty when fine. */
export function bookendProblems(b: Bookends, fileExists: (clipId: string) => boolean): string[] {
  const out: string[] = [];
  for (const slot of BOOKEND_SLOTS) {
    const s = b[slot];
    if (s.mode === "off") continue;
    const name = BOOKEND_SLOT_LABELS[slot].toLowerCase();
    if (!s.clipId) {
      out.push(
        `The ${name} is turned on but has no clip yet. Make or choose one, or turn it off to render without it.`,
      );
    } else if (!fileExists(s.clipId)) {
      out.push(`The ${name} file is missing. Make or choose it again, or turn it off to render without it.`);
    }
  }
  return out;
}

/** The estimated cost of the clips still to be made: slots set to AI with no clip, or a stale one. */
export function bookendEstimate(
  caps: Pick<ClipCapabilities, "prices" | "defaultResolution" | "durations" | "resolutions" | "aspects" | "model">,
  b: Bookends,
): { items: { slot: BookendSlot; estimate: ClipCostEstimate }[]; totalUsd: number; totalCents: number } {
  const items: { slot: BookendSlot; estimate: ClipCostEstimate }[] = [];
  for (const slot of BOOKEND_SLOTS) {
    const s = b[slot];
    if (s.mode !== "ai" || !s.prompt?.trim()) continue;
    const req = bookendRequest(s, caps);
    if (bookendStatus(slot, s, { model: caps.model, req }) === "ready") continue;
    items.push({ slot, estimate: estimateClipCost(caps, { prompts: [s.prompt], variants: 1, duration: req.duration, resolution: req.resolution }) });
  }
  return {
    items,
    totalUsd: items.reduce((n, i) => n + i.estimate.totalUsd, 0),
    totalCents: items.reduce((n, i) => n + i.estimate.totalCents, 0),
  };
}

/** The cross-fade actually used between two pieces: never more than half of the shorter. */
export function effectiveFade(fade: BookendFade, ...pieces: number[]): number {
  const room = Math.min(...pieces.filter((p) => p > 0)) / 2 - 0.05;
  const f = Math.min(FADE_SECONDS[fade], room);
  return f >= 0.05 ? Math.round(f * 100) / 100 : 0;
}

export type BookendPlan = {
  /** Fade used at each joint, in seconds. */
  fade: number;
  introStart: number;
  introEnd: number;
  mainStart: number;
  mainEnd: number;
  outroStart: number;
  outroEnd: number;
  total: number;
  /** Seconds later than in the main video everything of the main video happens. */
  offset: number;
};

/**
 * Where each piece of the final video sits. Joints overlap by the fade, so the
 * total is the sum of the pieces minus one fade per joint. `offset` is how far
 * the main video's own timeline (its speech, captions and cues) shifts.
 */
export function planBookends(mainSec: number, introSec: number | null, outroSec: number | null, fade: BookendFade): BookendPlan {
  const f = effectiveFade(fade, mainSec, ...(introSec ? [introSec] : []), ...(outroSec ? [outroSec] : []));
  const introEnd = introSec ?? 0;
  const mainStart = introSec ? introEnd - f : 0;
  const mainEnd = mainStart + mainSec;
  const outroStart = outroSec ? mainEnd - f : mainEnd;
  const outroEnd = outroSec ? outroStart + outroSec : mainEnd;
  return { fade: f, introStart: 0, introEnd, mainStart, mainEnd, outroStart, outroEnd, total: outroEnd, offset: mainStart };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Captions of the main video moved to where it now sits. */
export function shiftCaptions<T extends { start: number; end: number }>(captions: T[], offset: number): T[] {
  return captions.map((c) => ({ ...c, start: round(c.start + offset), end: round(c.end + offset) }));
}

export type BookendPromptContext = {
  slot: BookendSlot;
  title: string;
  description?: string;
  /** A few lines of the script, for the subject. */
  excerpt?: string;
  /** Tone or look of the video, in words. */
  style?: string;
  seconds: number;
};

export function BOOKEND_PROMPT_INSTRUCTION(ctx: BookendPromptContext): string {
  const feel =
    ctx.slot === "intro"
      ? "an opening title-sequence feel: establishing, inviting, with gentle motion that builds anticipation for the subject"
      : "a closing feel: a calm, satisfied last look at the subject, as if saying thank you or pointing to the next step";
  return `You are a cinematographer writing a prompt for a text-to-video model.

Write ONE prompt for a ${ctx.seconds}-second ${ctx.slot} (${ctx.slot === "intro" ? "opening" : "closing"}) clip for a video titled "${ctx.title}".${
    ctx.description ? ` About: ${ctx.description}` : ""
  }${ctx.style ? ` Look and tone of the video: ${ctx.style}.` : ""} It should have ${feel}.

Rules:
- Describe what the camera sees: subject, action, setting, lighting and one camera movement. Concrete and filmable.
- A single continuous shot with no scene cuts. Say so.
- No text, titles, captions, logos, signs or numbers on screen: the video adds its own title.
- No real people or recognizable faces; no brands, copyrighted characters or music. Use generic or abstract subjects.
- Nothing violent, sexual or distressing.
- Stay true to the subject of the video; do not invent facts.
- 40 to 80 words, plain sentences, one paragraph.
${ctx.excerpt ? `\nSCRIPT EXCERPT\n${ctx.excerpt.slice(0, 1500)}\n` : ""}
Respond with a single JSON object only: { "prompt": string }`;
}

/** The prompt out of the model's reply, cleaned the way clip prompts are. */
export function parseBookendPrompt(raw: unknown): string {
  const r = raw && typeof raw === "object" ? (raw as { prompt?: unknown }) : { prompt: raw };
  return text(typeof r.prompt === "string" ? r.prompt.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "").replace(/[*_`#>]+/g, "") : "", MAX_PROMPT_CHARS);
}
