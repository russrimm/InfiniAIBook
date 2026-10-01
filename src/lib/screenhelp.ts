import { z } from "zod";

/**
 * Screen helper: the user shares a screen or window, says what they are trying
 * to do, and the vision model coaches them through the app it sees, one step
 * at a time. Everything here is pure so the client, the route and the tests
 * share one definition.
 */

/** Largest frame accepted, as a data URL. A 1600 px JPEG is usually 150–400 KB. */
export const MAX_FRAME_CHARS = 3_000_000;
/** Longest edge a frame is scaled to before it is sent. */
export const MAX_FRAME_EDGE = 1600;
/** Thumbnail used only for change detection on the client. */
export const THUMB_W = 64;
export const THUMB_H = 36;
/** Text history kept for context; the most recent turns matter most. */
export const MAX_HISTORY_CHARS = 8000;

export const TRIGGERS = ["ask", "watch"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const STATUSES = ["next_step", "done", "unchanged", "cannot_see", "answer"] as const;
export type ReplyStatus = (typeof STATUSES)[number];

export const HistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});
export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

export const ScreenHelpRequestSchema = z.object({
  goal: z.string().trim().min(1, "Say what you need help with.").max(1000),
  /** The latest thing the user typed, for "ask" turns after the first. */
  message: z.string().trim().max(2000).optional(),
  trigger: z.enum(TRIGGERS),
  history: z.array(HistoryTurnSchema).max(60).default([]),
  frame: z
    .string()
    .max(MAX_FRAME_CHARS, "The screenshot is too large.")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "The screenshot is not a valid image."),
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
});
export type ScreenHelpRequest = z.infer<typeof ScreenHelpRequestSchema>;

/** A region of the frame, as fractions of its width and height. */
export type Box = { x: number; y: number; w: number; h: number; label: string };

export type ScreenHelpReply = {
  status: ReplyStatus;
  /** Markdown shown to the user. */
  say: string;
  /** The single action to take next, when there is one. */
  step: string | null;
  /** Where that action happens on the frame, when the model could place it. */
  target: Box | null;
};

export const SYSTEM_PROMPT = `You are a patient software coach. The user is sharing their screen and has told you what they want to do in the application they are looking at. You see a screenshot of their screen with every turn.

Your job is to help them understand and use that application themselves:
- Describe only what is visible in the screenshot. Never invent menus, buttons or settings you cannot see. If what they need is probably off-screen (a closed menu, another tab, further down), say where to look.
- Give ONE concrete next step at a time, naming the control exactly as it is labeled on screen and where it is ("the blue Share button at the top right").
- Briefly explain why the step matters when that helps them learn the app.
- You cannot click or type for them. Never ask for, read out or repeat passwords, codes or other secrets, even if they are visible.
- If the screenshot is blank, blurred or shows a different app than expected, say so plainly.

Reply with a JSON object only:
{
  "status": "next_step" | "done" | "unchanged" | "cannot_see" | "answer",
  "say": "Markdown for the user, under 120 words",
  "step": "the single action to take next, or null",
  "target": { "x": number, "y": number, "w": number, "h": number, "label": "short name of the control" } or null
}

- "next_step": there is an action to take; fill in "step" and, when the control is visible, "target".
- "answer": the user asked a question that needs an explanation rather than an action.
- "done": the goal looks accomplished on screen; congratulate them briefly and suggest what they might do next.
- "cannot_see": the screenshot does not show enough to help.
- "unchanged": only for automatic check-ins (trigger "watch") when nothing relevant has changed since your last step. Then "say" may be empty.

"target" is a box around the control for the next step, in PIXELS of the screenshot, measured from its top-left corner, using the image size you are given. Make it tight around the control. Use null if the control is not visible or you are unsure.`;

/** Keep the most recent turns that fit the budget, oldest first. */
export function trimHistory(history: HistoryTurn[], maxChars = MAX_HISTORY_CHARS): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i];
    const text = t.text.trim();
    if (!text) continue;
    if (used + text.length > maxChars) break;
    used += text.length;
    out.unshift({ role: t.role, text });
  }
  return out;
}

/** The text that accompanies the screenshot on this turn. */
export function turnPrompt(req: Pick<ScreenHelpRequest, "goal" | "message" | "trigger" | "width" | "height">): string {
  const lines = [
    `The user's goal: ${req.goal}`,
    `Screenshot size: ${req.width} × ${req.height} pixels.`,
  ];
  if (req.trigger === "watch") {
    lines.push(
      'Trigger: watch. This is an automatic check-in because the screen changed. If they made progress, give the next step or say they are done. If nothing relevant changed, reply with status "unchanged".'
    );
  } else if (req.message && req.message !== req.goal) {
    lines.push(`Trigger: ask. The user says: ${req.message}`);
  } else {
    lines.push("Trigger: ask. This is the start of the session; orient them and give the first step.");
  }
  return lines.join("\n");
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Turn the model's box into fractions of the frame.
 *
 * The prompt asks for pixels, but models sometimes answer in fractions
 * (every value at most 1). Boxes that are empty, cover most of the screen or
 * fall off it are dropped: a wrong highlight is worse than none.
 */
export function normalizeBox(raw: unknown, width: number, height: number): Box | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let x = num(r.x);
  let y = num(r.y);
  let w = num(r.w ?? r.width);
  let h = num(r.h ?? r.height);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0 || x < 0 || y < 0) return null;

  if (![x, y, w, h].every((v) => v <= 1)) {
    x /= width;
    y /= height;
    w /= width;
    h /= height;
  }
  if (x >= 1 || y >= 1) return null;

  const fx = clamp01(x);
  const fy = clamp01(y);
  const fw = Math.min(w, 1 - fx);
  const fh = Math.min(h, 1 - fy);
  if (fw < 0.003 || fh < 0.003) return null;
  if (fw * fh > 0.5) return null;

  const label = typeof r.label === "string" ? r.label.trim().slice(0, 80) : "";
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { x: round(fx), y: round(fy), w: round(fw), h: round(fh), label };
}

/** Validate the model's JSON leniently; anything unusable becomes a plain answer. */
export function parseReply(raw: unknown, width: number, height: number): ScreenHelpReply {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const status: ReplyStatus = (STATUSES as readonly string[]).includes(r.status as string)
    ? (r.status as ReplyStatus)
    : "answer";
  const say = typeof r.say === "string" ? r.say.trim().slice(0, 4000) : "";
  const stepRaw = typeof r.step === "string" ? r.step.trim().slice(0, 500) : "";
  const step = stepRaw && stepRaw.toLowerCase() !== "null" ? stepRaw : null;
  const target = status === "next_step" ? normalizeBox(r.target, width, height) : null;
  return { status, say: say || (step ?? ""), step, target };
}

/**
 * Fraction of thumbnail pixels that differ by more than `tolerance` (0–255).
 * Thumbnails of different sizes count as fully changed.
 */
export function frameDiff(a: ArrayLike<number>, b: ArrayLike<number>, tolerance = 24): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) changed++;
  }
  return changed / a.length;
}

/** Grayscale thumbnail from RGBA pixels, for `frameDiff`. */
export function toGray(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(Math.floor(rgba.length / 4));
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    out[i] = Math.round(0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]);
  }
  return out;
}

export const WATCH_DEFAULTS = {
  /** How often the screen is sampled. */
  sampleMs: 2500,
  /** Shortest gap between two model calls made by auto-watch. */
  minGapMs: 10_000,
  /** Share of the screen that must differ from the last analyzed frame. */
  changed: 0.02,
  /** Most the screen may still be moving between two samples to count as settled. */
  settled: 0.005,
};

/**
 * Whether auto-watch should ask the model about the current screen.
 *
 * It fires only when the screen differs from the frame last analyzed AND has
 * stopped moving, so typing, scrolling and video do not cause a call per
 * sample, and never while another request is in flight. It keeps running
 * while this tab is hidden: the user is usually working in the shared app.
 */
export function shouldWatch(s: {
  enabled: boolean;
  hasGoal: boolean;
  inFlight: boolean;
  sinceLastRequestMs: number;
  changedFromAnalyzed: number;
  changedFromPrevSample: number;
  opts?: Partial<typeof WATCH_DEFAULTS>;
}): boolean {
  const o = { ...WATCH_DEFAULTS, ...s.opts };
  if (!s.enabled || !s.hasGoal || s.inFlight) return false;
  if (s.sinceLastRequestMs < o.minGapMs) return false;
  if (s.changedFromAnalyzed < o.changed) return false;
  return s.changedFromPrevSample <= o.settled;
}

/** Fit a frame inside `MAX_FRAME_EDGE` without upscaling. */
export function fitFrame(width: number, height: number, maxEdge = MAX_FRAME_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type SessionTurn = {
  role: "user" | "assistant";
  text: string;
  step?: string | null;
  auto?: boolean;
};

/** A finished session as a Markdown note. Screenshots are not kept. */
export function sessionNote(input: { goal: string; turns: SessionTurn[]; date: Date }): {
  title: string;
  content: string;
} {
  const goal = input.goal.trim();
  const short = goal.length > 70 ? goal.slice(0, 67) + "…" : goal;
  const title = `Screen help: ${short}`;
  const steps = input.turns
    .filter((t) => t.role === "assistant" && t.step)
    .map((t) => t.step as string);

  const parts = [
    `**Goal:** ${goal}`,
    `*Screen helper session, ${input.date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}*`,
  ];
  if (steps.length) {
    parts.push(`## Steps\n\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
  }
  const convo = input.turns
    .filter((t) => t.text.trim())
    .map((t) =>
      t.role === "user"
        ? `**You:** ${t.text.trim()}`
        : `**Helper${t.auto ? " (noticed a change)" : ""}:** ${t.text.trim()}`
    )
    .join("\n\n");
  if (convo) parts.push(`## Conversation\n\n${convo}`);
  return { title, content: parts.join("\n\n") };
}
