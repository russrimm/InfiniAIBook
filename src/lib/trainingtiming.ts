/**
 * Server side of composed training-video timing: which presenter clips are
 * already rendered, and how long each sentence of the script takes to say.
 *
 * Sentences are measured by synthesizing them with the presenter's own
 * standard neural voice through the ordinary speech endpoint — a fraction of
 * a cent per video — and the result is scaled to the real avatar clip once it
 * exists. Standard neural voices are deterministic, so relative timings carry
 * over to the avatar's delivery of the same SSML.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { presenter, presenterVoice } from "./avatars";
import { applyReplacements, readNarration } from "./narration";
import { addBreaths } from "./prosody";
import { synthesizeRawSsml } from "./speech";
import { buildTrainingSsml, voiceSsml } from "./training";
import { mp3Duration } from "./motiontimeline";
import { trainingClipPath, ttsCachePath } from "./paths";
import { hashText } from "./trainingvisuals";
import {
  PARAGRAPH_PAUSE,
  estimateSectionTiming,
  splitSentences,
  type SectionTiming,
} from "./trainingtimeline";
import type { TrainingContent } from "./types";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function speechConfigured(): boolean {
  return Boolean(
    process.env.AZURE_SPEECH_REGION?.trim() &&
      (process.env.AZURE_SPEECH_KEY?.trim() || process.env.AZURE_SPEECH_RESOURCE_ID?.trim())
  );
}

/** What the avatar is asked to say for one section, replacements applied. */
export function sectionSsml(c: TrainingContent, index: number): string {
  const { preset } = presenter(c.presenter);
  const voice = presenterVoice(c.voice, preset.voice);
  const { replacements } = readNarration(c.narration);
  const s = c.sections[index];
  return buildTrainingSsml([{ title: s.title, text: applyReplacements(s.text, replacements) }], voice, c.voiceStyle);
}

/**
 * Identity of a section's presenter clip. Anything that changes the pixels or
 * the speech changes the hash; the visuals and the cues do not.
 */
export function sectionClipHash(c: TrainingContent, index: number): string {
  const { preset } = presenter(c.presenter);
  return sha1(
    JSON.stringify({
      v: 1,
      character: preset.character,
      style: preset.style,
      ssml: sectionSsml(c, index),
    })
  );
}

export function clipDuration(id: string, hash: string): number | null {
  try {
    if (!fs.existsSync(trainingClipPath(id, hash))) return null;
    const meta = JSON.parse(fs.readFileSync(trainingClipPath(id, hash, "json"), "utf8")) as {
      durationSec?: number;
    };
    return typeof meta.durationSec === "number" && meta.durationSec > 0 ? meta.durationSec : null;
  } catch {
    return null;
  }
}

export function saveClipDuration(id: string, hash: string, durationSec: number) {
  fs.writeFileSync(trainingClipPath(id, hash, "json"), JSON.stringify({ durationSec }));
}

function voiceName(c: TrainingContent): string {
  const { preset } = presenter(c.presenter);
  return presenterVoice(c.voice, preset.voice);
}

async function cachedSpeech(ssml: string): Promise<{ hash: string; seconds: number }> {
  const hash = sha1(ssml);
  const meta = ttsCachePath(hash, "json");
  try {
    const j = JSON.parse(fs.readFileSync(meta, "utf8")) as { seconds?: number };
    if (typeof j.seconds === "number" && fs.existsSync(ttsCachePath(hash, "mp3"))) {
      return { hash, seconds: j.seconds };
    }
  } catch {
    /* not cached yet */
  }
  const mp3 = await synthesizeRawSsml(ssml);
  const seconds = mp3Duration(mp3);
  fs.mkdirSync(path.dirname(meta), { recursive: true });
  fs.writeFileSync(ttsCachePath(hash, "mp3"), mp3);
  fs.writeFileSync(meta, JSON.stringify({ seconds }));
  return { hash, seconds };
}

/** Run a few at a time: the speech endpoint throttles bursts. */
async function pool<T, R>(items: T[], n: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await work(items[i]);
    })
  );
  return out;
}

export type MeasureOptions = {
  /** Also synthesize each section as one voice track for the preview. */
  preview?: boolean;
};

/**
 * Timing for every section. Uses, in order of trust: the rendered avatar clip,
 * measured speech, then a words-per-minute estimate. Speech failures degrade
 * to the estimate rather than failing the caller.
 */
export async function measureTraining(
  id: string,
  c: TrainingContent,
  opts: MeasureOptions = {}
): Promise<{ timings: SectionTiming[]; note?: string }> {
  const voice = voiceName(c);
  const { replacements } = readNarration(c.narration);
  const canSpeak = speechConfigured();
  let note: string | undefined;

  const timings = await pool(
    c.sections.map((section, i) => ({ section, i })),
    2,
    async ({ section, i }): Promise<SectionTiming> => {
      const base = estimateSectionTiming(section.text);
      const hash = sectionClipHash(c, i);
      const clip = clipDuration(id, hash);
      let timing: SectionTiming = clip
        ? {
            ...base,
            duration: clip,
            source: "avatar",
            clipUrl: `/api/training/${id}/clips/${hash}`,
            audioUrl: `/api/training/${id}/clips/${hash}`,
          }
        : base;
      if (!canSpeak) return timing;
      try {
        const sentences = splitSentences(section.text);
        const measured = await pool(sentences, 4, async (s) => {
          const ssml = voiceSsml(
            voice,
            addBreaths(escapeXml(applyReplacements(s.text, replacements)), 1),
            c.voiceStyle
          );
          const { seconds } = await cachedSpeech(ssml);
          return seconds + (s.paragraphEnd ? PARAGRAPH_PAUSE : 0);
        });
        timing = { ...timing, sentences: measured.map((x) => Math.round(x * 1000) / 1000) };
        if (!clip) {
          timing.source = "tts";
          timing.duration = Math.round(measured.reduce((a, b) => a + b, 0) * 1000) / 1000;
          if (opts.preview) {
            const whole = await cachedSpeech(sectionSsml(c, i));
            timing.duration = Math.round(whole.seconds * 1000) / 1000;
            timing.audioUrl = `/api/training/${id}/speech/${whole.hash}`;
          }
        }
      } catch (e) {
        note ??= `Speech timing fell back to an estimate: ${e instanceof Error ? e.message : "speech failed"}`;
      }
      return { ...timing, textHash: hashText(section.text) };
    }
  );
  return { timings, note };
}
