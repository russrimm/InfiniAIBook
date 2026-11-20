import type { TrainingContent, TrainingSection } from "@/lib/types";
import { gestureMode, type GestureMode } from "@/lib/gestures";
import { EMPTY_NARRATION, readNarration, type NarrationSettings } from "@/lib/narration";
import { normalizeMusicChoice, type MusicChoice } from "@/lib/musicchoice";
import { normalizeWatermark, type WatermarkChoice } from "@/lib/watermarkchoice";
import {
  findAnchor,
  normalizeComposition,
  tokenize,
  type TrainingComposition,
  type TrainingCue,
} from "@/lib/trainingvisuals";

export const PRESENTER_STAGES: { key: string; label: string }[] = [
  { key: "submitting", label: "Sending the transcript to Azure" },
  { key: "submitted", label: "Queued for the avatar" },
  { key: "rendering", label: "Rendering the presenter" },
  { key: "downloading", label: "Saving the video" },
];

export const COMPOSED_STAGES: { key: string; label: string }[] = [
  { key: "submitting", label: "Sending the sections to Azure" },
  { key: "submitted", label: "Queued for the avatar" },
  { key: "rendering", label: "Rendering the presenter, section by section" },
  { key: "composing", label: "Composing the visuals over the presenter" },
];

export const IN_FLIGHT = new Set([
  "submitting",
  "submitted",
  "rendering",
  "downloading",
  "composing",
]);

export type Tab = "script" | "visuals" | "design" | "preview";

export type Draft = {
  title: string;
  objectives: string;
  sections: TrainingSection[];
  presenter: string;
  voice: string;
  /** Empty for the voice's default delivery. */
  voiceStyle: string;
  gestureMode: GestureMode;
  background: string;
  music: MusicChoice | null;
  watermark: WatermarkChoice | null;
  narration: NarrationSettings;
  composition: TrainingComposition;
};

export const toDraft = (c: TrainingContent): Draft => ({
  title: c.title,
  objectives: (c.objectives ?? []).join("\n"),
  sections: c.sections.map((s) => ({
    ...s,
    cues: s.cues?.map((q) => ({ ...q })),
  })),
  presenter: c.presenter,
  voice: c.voice,
  voiceStyle: c.voiceStyle ?? "",
  gestureMode: gestureMode(c.gestureMode),
  background: c.background,
  music: normalizeMusicChoice(c.musicChoice),
  watermark: normalizeWatermark(c.watermarkChoice),
  narration: c.narration ? readNarration(c.narration) : EMPTY_NARRATION,
  composition: normalizeComposition(c.composition),
});

export const words = (sections: Pick<TrainingSection, "text">[]) =>
  sections.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0);

export const fmt = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-well px-2.5 py-1.5 text-[13px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:opacity-60";

export const KIND_DOT: Record<string, string> = {
  title: "bg-violet-400",
  objectives: "bg-emerald-400",
  bullets: "bg-blue-400",
  stat: "bg-amber-400",
  quote: "bg-pink-400",
  check: "bg-red-400",
  image: "bg-teal-400",
  screenshot: "bg-teal-400",
  infographic: "bg-purple-400",
  presenter: "bg-slate-400",
};

/** Character spans of each cue's anchor in a section, for highlighting. */
export function anchorSpans(text: string, cues: TrainingCue[]) {
  const toks = tokenize(text);
  const spans: { start: number; end: number; cue: TrainingCue }[] = [];
  for (const q of cues) {
    const m = findAnchor(text, q.anchor, toks);
    if (!m) continue;
    const n = Math.max(1, tokenize(q.anchor).length);
    const last = toks[Math.min(toks.length - 1, m.word + n - 1)];
    spans.push({ start: toks[m.word].start, end: last.end, cue: q });
  }
  spans.sort((a, b) => a.start - b.start);
  return spans.filter((s, i) => i === 0 || s.start >= spans[i - 1].end);
}
