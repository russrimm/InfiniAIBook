import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import {
  captionsPath,
  imagePath,
  removeImage,
  trainingClipPath,
  trainingClipsDir,
  trainingCueClipPath,
  trainingCueClipsDir,
  trainingRasterPath,
  trainingVisualsDir,
  videoDir,
  videoPath,
  videoWorkDir,
} from "./paths";
import {
  avatarConfigured,
  avatarFailureReason,
  avatarNotConfigured,
  avatarPollDelayMs,
  deleteAvatarJob,
  downloadAvatarResult,
  getAvatarJob,
  submitAvatarJob,
} from "./avatarbatch";
import { RETRYABLE_STATUSES } from "./speechretry";
import {
  presenter,
  presenterVoice,
  backgroundColor,
  MAX_AVATAR_MINUTES,
} from "./avatars";
import { buildTrainingSsml, countWords } from "./training";
import { gestureMode } from "./gestures";
import { WORDS_PER_MINUTE } from "./voices";
import type { TrainingClip, TrainingContent, TrainingStage } from "./types";
import { applyReplacements, readNarration } from "./narration";
import { mixMusicInto, resolveMusic } from "./music";
import { normalizeMusicChoice } from "./musicchoice";
import { stampWatermark } from "./watermark";
import { runPythonRenderer } from "./python";
import {
  chooseRenderer,
  clipsHaveAlpha,
  finishHyperframesRender,
  fitCueClips,
  hyperframesFailedNote,
  runHyperframesRender,
  stageHyperframesProject,
} from "./hyperframes";
import { buildHyperframesProject } from "./traininghyperframes";
import { trainingHightech } from "./traininghightech";
import { throttleProgress } from "./renderprogress";
import { compositionPalette, normalizeComposition } from "./trainingvisuals";
import {
  compileTrainingTimeline,
  composeInputOf,
  estimateSectionTiming,
  rasterJobs,
  renderConfig,
  toWebVtt,
  type ComposeInput,
} from "./trainingtimeline";
import {
  clipDuration,
  measureTraining,
  saveClipDuration,
  sectionClipHash,
  sectionSsml,
} from "./trainingtiming";

/**
 * The render lifecycle for training videos.
 *
 * Unlike the whiteboard build, the heavy work happens in Azure, not in this
 * process. So a restart does not lose the job: the synthesis id is on the row,
 * and a stalled row is picked up again rather than marked failed.
 */

const POLL_MS = 10_000;
const STALL_MS = 60_000;
/** Longer than any plausible render of a 20-minute script. */
const GIVE_UP_MS = 90 * 60_000;

const IN_FLIGHT: TrainingStage[] = [
  "submitting",
  "submitted",
  "rendering",
  "downloading",
  "composing",
];

// Survives Next's dev-mode module reloads, which would otherwise start a
// second watcher for a job the first one is still polling.
const g = globalThis as unknown as {
  __trainingWatchers?: Set<string>;
  __trainingAborts?: Map<string, AbortController>;
  __trainingSubmitting?: Set<string>;
};
const watching = (g.__trainingWatchers ??= new Set<string>());
/** Renders still being accepted by Azure, which may be waiting out a rate limit. */
const submitting = (g.__trainingSubmitting ??= new Set<string>());
/** Cancels a render's waiting when its artifact is deleted. */
const aborts = (g.__trainingAborts ??= new Map<string, AbortController>());

function abortControllerFor(id: string): AbortController {
  let c = aborts.get(id);
  if (!c || c.signal.aborted) {
    c = new AbortController();
    aborts.set(id, c);
  }
  return c;
}

function releaseAbort(id: string) {
  if (!watching.has(id) && !submitting.has(id)) aborts.delete(id);
}

/** Stop a render's waiting soon after its artifact is deleted. Returns the cleanup. */
function abortWhenDeleted(id: string, controller: AbortController): () => void {
  const t = setInterval(() => {
    if (!read(id)) controller.abort();
  }, 5_000);
  return () => clearInterval(t);
}

/** Records why a render is waiting, where the progress card shows it. */
function noteWaiting(id: string) {
  return (message: string) => {
    const c = read(id);
    if (c && isRendering(c))
      writeTraining(id, { progress: { stage: c.progress.stage, note: message } });
  };
}

const userError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A failure that only waiting can fix, once the retries are spent. */
const transient = (e: unknown) => {
  if (e instanceof Error && e.name === "AbortError") return false;
  const status = (e as { status?: number }).status;
  return !status || status === 429 || RETRYABLE_STATUSES.has(status);
};

type Row = { id: string; type: string; content: string; created_at: number };

function read(id: string): (TrainingContent & { heartbeatAt?: number }) | null {
  const row = db
    .prepare("SELECT id, type, content, created_at FROM artifacts WHERE id = ?")
    .get(id) as unknown as Row | undefined;
  if (!row || row.type !== "training") return null;
  try {
    return JSON.parse(row.content);
  } catch {
    return null;
  }
}

/** A training artifact's content, or null when missing or another type. */
export const readTraining = (id: string) => read(id);

export function writeTraining(id: string, patch: Partial<TrainingContent>) {
  const current = read(id);
  if (!current) return;
  const next = {
    ...current,
    ...patch,
    progress: { ...current.progress, ...(patch.progress ?? {}) },
    heartbeatAt: Date.now(),
  };
  db.prepare("UPDATE artifacts SET content = ?, title = ? WHERE id = ?").run(
    JSON.stringify(next),
    next.title,
    id,
  );
}

export const isRendering = (c: Pick<TrainingContent, "progress">) =>
  IN_FLIGHT.includes(c.progress?.stage);

/** Letters and digits at both ends, 3-64 characters: the service's rule. */
const synthesisIdFor = (id: string) =>
  `infiniaibook-${id.replace(/[^A-Za-z0-9-]/g, "")}-${Date.now()}`;

export function estimateMinutes(c: Pick<TrainingContent, "sections">): number {
  return countWords(c.sections) / WORDS_PER_MINUTE;
}

/**
 * Submit the current transcript. Returns once Azure has accepted the job; the
 * render itself is watched in the background.
 */
export async function startTrainingRender(id: string): Promise<void> {
  const c = read(id);
  if (!c) throw userError("Training video not found.", 404);
  if (isRendering(c)) throw userError("This video is already rendering.", 409);
  if (!c.sections?.some((s) => s.text.trim())) {
    throw userError(
      "The transcript is empty — write something for the presenter to say.",
    );
  }
  const minutes = estimateMinutes(c);
  if (minutes > MAX_AVATAR_MINUTES * 0.95) {
    throw userError(
      `The transcript runs about ${Math.round(minutes)} minutes; avatar videos are limited to ${MAX_AVATAR_MINUTES}. Shorten it first.`,
    );
  }
  if (normalizeComposition(c.composition).mode === "composed") {
    startComposedRender(id, c);
    return;
  }

  const { preset } = presenter(c.presenter);
  const voice = presenterVoice(c.voice, preset.voice);
  const { replacements } = readNarration(c.narration);
  const spoken = c.sections.map((s) => ({
    ...s,
    text: applyReplacements(s.text, replacements),
  }));
  const ssml = buildTrainingSsml(spoken, voice, c.voiceStyle, {
    presenter: c.presenter,
    mode: gestureMode(c.gestureMode),
  });
  if (Buffer.byteLength(ssml) > 450_000) {
    throw userError(
      "The transcript is too long for a single avatar job. Shorten it first.",
    );
  }

  const previous = c.progress?.synthesisId;
  const synthesisId = synthesisIdFor(id);
  writeTraining(id, {
    progress: {
      stage: "submitting",
      synthesisId,
      note: undefined,
      clips: undefined,
    },
  });

  // Azure may rate limit the submission, which can take minutes to wait out;
  // keep the row alive meanwhile so it is not taken for a dead render.
  submitting.add(id);
  const controller = abortControllerFor(id);
  const stopGuard = abortWhenDeleted(id, controller);
  const beat = setInterval(() => writeTraining(id, {}), 20_000);
  try {
    await submitAvatarJob(
      synthesisId,
      ssml,
      {
        character: preset.character,
        style: preset.style,
        photo: preset.photo,
        photoModel: preset.photoModel,
        background: backgroundColor(c.background),
        description: c.title,
      },
      { signal: controller.signal, onWait: noteWaiting(id) },
    );
  } catch (e) {
    // Deleted while waiting: there is nothing left to record the failure on.
    if (read(id))
      writeTraining(id, {
        progress: {
          stage: c.videoUrl ? "done" : "transcript",
          synthesisId: previous,
          note: e instanceof Error ? e.message : "Could not start the render.",
        },
      });
    throw e;
  } finally {
    clearInterval(beat);
    stopGuard();
    submitting.delete(id);
    releaseAbort(id);
  }

  writeTraining(id, {
    progress: {
      stage: "submitted",
      synthesisId,
      submittedAt: Date.now(),
      note: undefined,
    },
  });
  if (previous && previous !== synthesisId) void deleteAvatarJob(previous);
  watch(id);
}

function watch(id: string) {
  if (watching.has(id)) return;
  watching.add(id);
  const controller = abortControllerFor(id);
  const { signal } = controller;
  const stopGuard = abortWhenDeleted(id, controller);
  void poll(id, signal)
    .catch((e) => {
      if (signal.aborted) return;
      console.error("[training] render failed", e);
      writeTraining(id, {
        progress: {
          stage: "failed",
          note: e instanceof Error ? e.message : "The render failed.",
        },
      });
    })
    .finally(() => {
      stopGuard();
      watching.delete(id);
      releaseAbort(id);
    });
}

async function poll(id: string, signal: AbortSignal): Promise<void> {
  for (;;) {
    if (signal.aborted) return;
    const c = read(id);
    // Deleted, or superseded by something that is no longer a render.
    if (!c || !isRendering(c)) return;
    const synthesisId = c.progress.synthesisId;
    if (!synthesisId)
      throw new Error("The render lost track of its Azure job.");

    if (
      c.progress.submittedAt &&
      Date.now() - c.progress.submittedAt > GIVE_UP_MS
    ) {
      throw new Error(
        "Azure did not finish the render within 90 minutes. Try again.",
      );
    }

    let job;
    try {
      job = await getAvatarJob(synthesisId, { signal, onWait: noteWaiting(id) });
    } catch (e) {
      if (signal.aborted) return;
      // Transient failures are retried; a permission or missing-job error is not.
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 429 && status !== 408) throw e;
      writeTraining(id, {});
      await sleep(avatarPollDelayMs(POLL_MS));
      continue;
    }

    if (job.status === "Failed") {
      throw new Error(await avatarFailureReason(job));
    }

    if (job.status === "Succeeded") {
      const result = job.outputs?.result;
      if (!result)
        throw new Error("Azure finished the render but returned no video.");
      writeTraining(id, {
        progress: { stage: "downloading", synthesisId, note: undefined },
      });
      fs.mkdirSync(videoDir(), { recursive: true });
      const bytes = await downloadAvatarResult(result, videoPath(id));
      let withMusic = false;
      let note: string | undefined;
      const music = resolveMusic(normalizeMusicChoice(c.musicChoice));
      if (music) {
        try {
          await mixMusicInto(videoPath(id), music, "video");
          withMusic = true;
        } catch (e) {
          console.warn(
            "[training] music mix failed, keeping the video without it",
            e,
          );
          note =
            "The music could not be mixed in, so the video was saved without it.";
        }
      }
      const mark = await stampWatermark(
        videoPath(id),
        c.watermarkChoice,
        "training",
      );
      note = [note, mark.note].filter(Boolean).join(" ") || undefined;
      const ms = job.properties?.durationInMilliseconds;
      const renderedAt = Date.now();
      writeTraining(id, {
        progress: { stage: "done", synthesisId, note },
        // Cache-busted so a re-render is not served from the browser's copy.
        videoUrl: `/api/video/${id}?v=${renderedAt}`,
        captionsUrl: undefined,
        bytes:
          withMusic || mark.watermarked
            ? fs.statSync(videoPath(id)).size
            : bytes,
        music: withMusic,
        watermarked: mark.watermarked,
        durationSec: ms ? Math.round(ms / 100) / 10 : undefined,
        billedSeconds:
          job.properties?.billingDetails?.talkingAvatarDurationSeconds,
        renderedAt,
        editedSinceRender: false,
      });
      // The copy on disk is now the only one needed.
      void deleteAvatarJob(synthesisId);
      return;
    }

    const stage: TrainingStage =
      job.status === "Running" ? "rendering" : "submitted";
    writeTraining(id, { progress: { stage, synthesisId, note: undefined } });
    await sleep(avatarPollDelayMs(POLL_MS));
  }
}

/**
 * Resume watching a render whose watcher died with the process. Called from
 * the endpoint the player polls, so a restart heals itself on the next tick.
 */
export function resumeStalledTraining(id: string): void {
  const c = read(id);
  if (!c || !isRendering(c) || watching.has(id) || submitting.has(id)) return;
  const last = Number(c.heartbeatAt ?? 0);
  if (Date.now() - last < STALL_MS) return;

  // Composed renders keep every clip's state on the row, so the watcher can
  // pick up wherever the last one stopped — including re-running the compose.
  if (c.progress.clips) {
    watchComposed(id);
    return;
  }

  if (c.progress.stage === "submitting" || !c.progress.synthesisId) {
    // Died between deciding to submit and Azure accepting — nothing to resume.
    writeTraining(id, {
      progress: {
        stage: c.videoUrl ? "done" : "transcript",
        note: "The render was interrupted before Azure accepted it. Render again to retry.",
      },
    });
    return;
  }
  watch(id);
}

export function resumeStalledTrainings(notebookId: string): void {
  const rows = db
    .prepare(
      "SELECT id FROM artifacts WHERE type = 'training' AND notebook_id = ?",
    )
    .all(notebookId) as unknown as { id: string }[];
  for (const r of rows) resumeStalledTraining(r.id);
}

/**
 * Clean up Azure's copies and the pictures the video owned when the artifact
 * goes. The MP4, clips and drawn visuals are removed by the caller.
 */
export function forgetTraining(content: string): void {
  try {
    const c = JSON.parse(content) as TrainingContent;
    if (c.progress?.synthesisId) void deleteAvatarJob(c.progress.synthesisId);
    for (const clip of c.progress?.clips ?? []) {
      if (clip.synthesisId) void deleteAvatarJob(clip.synthesisId);
    }
    const images = new Set<string>();
    for (const s of c.sections ?? [])
      for (const q of s.cues ?? []) if (q.imageId) images.add(q.imageId);
    if (c.composition?.logoId) images.add(c.composition.logoId);
    for (const img of images) removeImage(img);
  } catch {
    /* nothing to clean */
  }
}

// ---------------------------------------------------------------------------
// Composed renders: one transparent presenter clip per section, cached by
// content, then laid over the visuals by scripts/training/render.py.
// ---------------------------------------------------------------------------

const REFUSED_NOTE =
  "Azure Speech is rate limiting new avatar jobs. The sections already rendering carry on, and the rest will be tried again as they finish.";

const avatarConcurrency = () => {
  const n = Number(process.env.AZURE_AVATAR_CONCURRENCY);
  return Number.isInteger(n) && n >= 1 ? Math.min(8, n) : 2;
};

export function composeInput(c: TrainingContent): ComposeInput {
  return composeInputOf(c);
}

/** Raster keys and states the compositor needs that the browser has not drawn. */
export function missingRasters(
  id: string,
  c: TrainingContent,
): { key: string; state: number }[] {
  const out: { key: string; state: number }[] = [];
  for (const job of rasterJobs(composeInput(c))) {
    for (let s = 0; s < job.states; s++) {
      if (!fs.existsSync(trainingRasterPath(id, job.key, s)))
        out.push({ key: job.key, state: s });
    }
  }
  return out;
}

function startComposedRender(id: string, c: TrainingContent): void {
  const missing = missingRasters(id, c);
  if (missing.length) {
    throw userError(
      `${missing.length} visual${missing.length === 1 ? " has" : "s have"} not been drawn yet. Render from the training editor, which prepares them first.`,
      409,
    );
  }
  const clips: TrainingClip[] = c.sections.map((_, i) => {
    const hash = sectionClipHash(c, i);
    return { hash, status: clipDuration(id, hash) ? "cached" : "pending" };
  });
  const fresh = clips.every((k) => k.status === "cached");
  // Fail now, not from the background watcher, so the editor can say why.
  if (!fresh && !avatarConfigured()) throw avatarNotConfigured();
  writeTraining(id, {
    progress: {
      stage: fresh ? "composing" : "submitting",
      clips,
      submittedAt: Date.now(),
      synthesisId: undefined,
      note: undefined,
    },
  });
  watchComposed(id);
}

function watchComposed(id: string) {
  if (watching.has(id)) return;
  watching.add(id);
  const controller = abortControllerFor(id);
  const { signal } = controller;
  const stopGuard = abortWhenDeleted(id, controller);
  void pollComposed(id, signal)
    .catch((e) => {
      if (signal.aborted) return;
      console.error("[training] composed render failed", e);
      const c = read(id);
      // Clips already downloaded stay cached; only in-flight jobs are dropped.
      const clips = (c?.progress.clips ?? []).map((k) => {
        if (k.status === "submitted" || k.status === "rendering") {
          if (k.synthesisId) void deleteAvatarJob(k.synthesisId);
          return { hash: k.hash, status: "failed" as const };
        }
        return k;
      });
      writeTraining(id, {
        progress: {
          stage: "failed",
          clips,
          note: e instanceof Error ? e.message : "The render failed.",
        },
      });
    })
    .finally(() => {
      stopGuard();
      watching.delete(id);
      releaseAbort(id);
    });
}

async function pollComposed(id: string, signal: AbortSignal): Promise<void> {
  // The id each section's create call goes out under. Kept until Azure accepts
  // it, so a retry after a lost reply adopts the job already created for it
  // instead of paying for a second one.
  const submitIds = new Map<number, string>();
  // Set when Azure kept refusing a new job: the jobs already running carry on,
  // and the render fails only if none are left to wait for.
  let refused: Error | undefined;
  const onWait = noteWaiting(id);

  for (;;) {
    if (signal.aborted) return;
    const c = read(id);
    if (!c || !isRendering(c) || !c.progress.clips) return;
    if (c.progress.stage === "composing") {
      await compose(id, c);
      return;
    }

    const { preset } = presenter(c.presenter);
    const clips = c.progress.clips.map((k) => ({ ...k }));
    fs.mkdirSync(trainingClipsDir(id), { recursive: true });

    // Another section with the same words may already have produced this clip.
    for (const k of clips) {
      if (
        (k.status === "pending" || k.status === "failed") &&
        clipDuration(id, k.hash)
      )
        k.status = "cached";
    }

    let active = clips.filter(
      (k) => k.status === "submitted" || k.status === "rendering",
    ).length;
    refused = undefined;
    for (let i = 0; i < clips.length && active < avatarConcurrency(); i++) {
      const k = clips[i];
      if (k.status !== "pending" && k.status !== "failed") continue;
      if (
        clips.some(
          (o, j) =>
            j < i &&
            o.hash === k.hash &&
            o.status !== "cached" &&
            o.status !== "done",
        )
      ) {
        continue;
      }
      const synthesisId =
        submitIds.get(i) ?? `${synthesisIdFor(id)}-s${i + 1}`;
      submitIds.set(i, synthesisId);
      try {
        await submitAvatarJob(
          synthesisId,
          sectionSsml(c, i),
          {
            character: preset.character,
            style: preset.style,
            photo: preset.photo,
            photoModel: preset.photoModel,
            background: backgroundColor(c.background),
            description: `${c.title} — section ${i + 1}`,
            transparent: true,
          },
          { signal, onWait },
        );
      } catch (e) {
        if (signal.aborted || !transient(e)) throw e;
        refused = e instanceof Error ? e : new Error(String(e));
        break;
      }
      submitIds.delete(i);
      Object.assign(k, {
        status: "submitted",
        synthesisId,
        submittedAt: Date.now(),
      });
      // Record each accepted job at once, so a later failure or a restart can still find and cancel it.
      writeTraining(id, {
        progress: { stage: "submitted", clips, note: undefined },
      });
      active++;
    }
    if (refused && active === 0) throw refused;
    writeTraining(id, {
      progress: {
        stage: "submitted",
        clips,
        note: refused ? REFUSED_NOTE : undefined,
      },
    });

    for (let i = 0; i < clips.length; i++) {
      const k = clips[i];
      if (
        (k.status !== "submitted" && k.status !== "rendering") ||
        !k.synthesisId
      )
        continue;
      if (k.submittedAt && Date.now() - k.submittedAt > GIVE_UP_MS) {
        throw new Error(
          `Azure did not finish section ${i + 1} within 90 minutes. Try again.`,
        );
      }
      let job;
      try {
        job = await getAvatarJob(k.synthesisId, { signal, onWait });
      } catch (e) {
        if (signal.aborted) return;
        const status = (e as { status?: number }).status;
        if (status && status < 500 && status !== 429 && status !== 408) throw e;
        continue;
      }
      if (job.status === "Failed") {
        throw new Error(`Section ${i + 1}: ${await avatarFailureReason(job)}`);
      }
      if (job.status === "Succeeded") {
        const result = job.outputs?.result;
        if (!result)
          throw new Error(
            `Azure finished section ${i + 1} but returned no video.`,
          );
        await downloadAvatarResult(result, trainingClipPath(id, k.hash));
        const ms = job.properties?.durationInMilliseconds;
        saveClipDuration(
          id,
          k.hash,
          ms ? ms / 1000 : estimateSectionTiming(c.sections[i].text).duration,
        );
        Object.assign(k, {
          status: "done",
          durationSec: ms ? ms / 1000 : undefined,
          billedSec:
            job.properties?.billingDetails?.talkingAvatarDurationSeconds,
        });
        void deleteAvatarJob(k.synthesisId);
        delete k.synthesisId;
      } else if (job.status === "Running") {
        k.status = "rendering";
      }
    }

    // Re-read so a deletion while polling is honored.
    if (!read(id)) return;
    const allDone = clips.every(
      (k) => k.status === "cached" || k.status === "done",
    );
    const anyRendering = clips.some((k) => k.status === "rendering");
    writeTraining(id, {
      progress: {
        stage: allDone ? "composing" : anyRendering ? "rendering" : "submitted",
        clips,
        // A rate limit notice stays up until a later pass gets a job through.
        note: refused ? REFUSED_NOTE : undefined,
      },
    });
    if (allDone) continue;
    await sleep(avatarPollDelayMs(POLL_MS));
  }
}

async function compose(id: string, c: TrainingContent): Promise<void> {
  const input = composeInput(c);
  const comp = input.composition;
  const work = videoWorkDir(id);
  fs.mkdirSync(work, { recursive: true });
  const beat = setInterval(() => writeTraining(id, {}), 20_000);
  try {
    const { timings } = await measureTraining(id, c);
    const missing = timings.findIndex((t) => t.source !== "avatar");
    if (missing >= 0)
      throw new Error(
        `The presenter clip for section ${missing + 1} is missing. Render again.`,
      );
    const tl = compileTrainingTimeline(input, timings);
    // A visual whose clip file has gone missing is left out rather than failing the whole video.
    const lost = tl.cues.filter((q) => q.clip && !fs.existsSync(trainingCueClipPath(id, q.clip.id)));
    let clipNote: string | undefined;
    if (lost.length) {
      tl.cues = tl.cues.filter((q) => !lost.includes(q));
      clipNote = `${lost.length} video clip${lost.length === 1 ? " was" : "s were"} missing and left out. Generate ${lost.length === 1 ? "it" : "them"} again from the visuals editor.`;
    }
    const slash = (p: string) => p.replace(/\\/g, "/");
    const hashes = c.sections.map((_, i) => sectionClipHash(c, i));
    const logo = comp.logoId ? imagePath(comp.logoId) : null;
    const out = path.join(work, "render.mp4");

    let note: string | undefined;
    let rendered = false;
    // A fresh reporter per attempt, so a fallback render starts its bar over.
    const reporter = () => {
      writeTraining(id, { progress: { stage: "composing", renderPct: 0 } });
      return throttleProgress((renderPct) =>
        writeTraining(id, { progress: { stage: "composing", renderPct } }),
      );
    };
    const hightech = comp.look === "hightech";
    const choice = chooseRenderer("TRAINING_RENDERER", hightech);
    note = [choice.note, clipNote].filter(Boolean).join(" ") || undefined;
    if (choice.renderer === "hyperframes") {
      try {
        const clipFiles = hashes.map((h) => trainingClipPath(id, h));
        const alpha = await clipsHaveAlpha(clipFiles, work);
        const opaque = clipFiles.findIndex((f) => !alpha[f]);
        if (opaque >= 0)
          throw new Error(
            `the presenter clip for section ${opaque + 1} has no transparency`,
          );
        // Each generated clip is cut, held or looped to its visual's length first.
        const fitted = new Map<string, string>();
        const fits = tl.cues.flatMap((q) => {
          if (!q.clip) return [];
          const dest = path.join(work, `cue-clip-${q.id}.mp4`);
          fitted.set(q.id, dest);
          return [{
            src: trainingCueClipPath(id, q.clip.id),
            dest,
            seconds: Math.max(0.1, Math.round((q.end - q.start + tl.timing.cueOut) * 1000) / 1000),
            fit: q.clip.fit,
          }];
        });
        await fitCueClips(fits, work);
        const project = buildHyperframesProject(tl, {
          background: backgroundColor(c.background),
          clip: (i) => clipFiles[i],
          raster: (key, state) => trainingRasterPath(id, key, state),
          cueClip: (cueId) => fitted.get(cueId)!,
          burnCaptions: comp.captions === "burned",
          logo: logo && fs.existsSync(logo) ? logo : null,
          ...(hightech
            ? { hightech: trainingHightech(input, compositionPalette(comp)) }
            : {}),
        });
        const dir = path.join(work, "hyperframes");
        stageHyperframesProject(project, dir);
        const mp4 = await runHyperframesRender(dir, project.fps, reporter());
        await finishHyperframesRender(mp4, out, tl.duration, work);
        rendered = fs.existsSync(out);
      } catch (e) {
        console.warn(
          "[training] HyperFrames render failed, using the standard compositor",
          e,
        );
        note = hyperframesFailedNote(hightech, "compositor");
        note = [note, clipNote].filter(Boolean).join(" ");
      }
    }
    if (!rendered) {
      const config = renderConfig(tl, {
        output: slash(out),
        background: backgroundColor(c.background),
        palette: compositionPalette(comp),
        clip: (i) => slash(trainingClipPath(id, hashes[i])),
        raster: (key, state) => slash(trainingRasterPath(id, key, state)),
        cueClip: (clipId) => slash(trainingCueClipPath(id, clipId)),
        burnCaptions: comp.captions === "burned",
        logo: logo && fs.existsSync(logo) ? slash(logo) : null,
      });
      const configPath = path.join(work, "training.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      await runPythonRenderer(["training", "render.py"], configPath, reporter());
    }
    if (!fs.existsSync(out))
      throw new Error("The compositor finished but produced no file.");

    let withMusic = false;
    const music = resolveMusic(normalizeMusicChoice(c.musicChoice));
    if (music) {
      try {
        await mixMusicInto(out, music, "video");
        withMusic = true;
      } catch (e) {
        console.warn(
          "[training] music mix failed, keeping the video without it",
          e,
        );
        note = [
          note,
          "The music could not be mixed in, so the video was saved without it.",
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    const mark = await stampWatermark(out, c.watermarkChoice, "training");
    note = [note, mark.note].filter(Boolean).join(" ") || undefined;

    if (!read(id)) return;
    fs.mkdirSync(videoDir(), { recursive: true });
    try {
      fs.renameSync(out, videoPath(id));
    } catch {
      // Windows refuses to replace a file a player still has open.
      fs.rmSync(videoPath(id), { force: true });
      fs.renameSync(out, videoPath(id));
    }
    const renderedAt = Date.now();
    let captionsUrl: string | undefined;
    if (comp.captions !== "off" && tl.captions.length) {
      fs.writeFileSync(captionsPath(id), toWebVtt(tl.captions));
      captionsUrl = `/api/training/${id}/captions?v=${renderedAt}`;
    } else {
      fs.rmSync(captionsPath(id), { force: true });
    }
    pruneComposedFiles(id, c, hashes);

    const billed = (c.progress.clips ?? []).reduce(
      (n, k) => n + (k.billedSec ?? 0),
      0,
    );
    writeTraining(id, {
      progress: {
        stage: "done",
        renderPct: undefined,
        clips: (c.progress.clips ?? []).map((k) => ({
          hash: k.hash,
          status: "cached" as const,
          durationSec: k.durationSec,
        })),
        note,
      },
      videoUrl: `/api/video/${id}?v=${renderedAt}`,
      captionsUrl,
      bytes: fs.statSync(videoPath(id)).size,
      music: withMusic,
      watermarked: mark.watermarked,
      durationSec: Math.round(tl.duration * 10) / 10,
      billedSeconds: billed || undefined,
      renderedAt,
      editedSinceRender: false,
    });
  } finally {
    clearInterval(beat);
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      /* scratch is not worth failing a finished video over */
    }
  }
}

/** Drop clips and drawings the current script no longer uses. */
function pruneComposedFiles(id: string, c: TrainingContent, hashes: string[]) {
  const keepClips = new Set(hashes);
  try {
    for (const f of fs.readdirSync(trainingClipsDir(id))) {
      if (!keepClips.has(f.replace(/\.(webm|json|part)$/, "")))
        fs.rmSync(path.join(trainingClipsDir(id), f), { force: true });
    }
  } catch {
    /* nothing to prune */
  }
  const keepKeys = new Set(rasterJobs(composeInput(c)).map((j) => j.key));
  const keepCueClips = new Set(
    c.sections.flatMap((s) => (s.cues ?? []).flatMap((q) => (q.clipId ? [q.clipId] : []))),
  );
  try {
    for (const f of fs.readdirSync(trainingCueClipsDir(id))) {
      if (!keepCueClips.has(f.replace(/\.(mp4|jpg|part)$/, "")))
        fs.rmSync(path.join(trainingCueClipsDir(id), f), { force: true });
    }
  } catch {
    /* nothing to prune */
  }
  try {
    for (const f of fs.readdirSync(trainingVisualsDir(id))) {
      if (!keepKeys.has(f.split("-")[0]))
        fs.rmSync(path.join(trainingVisualsDir(id), f), { force: true });
    }
  } catch {
    /* nothing to prune */
  }
}
