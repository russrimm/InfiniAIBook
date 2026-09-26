import fs from "node:fs";
import { db } from "./db";
import { videoDir, videoPath } from "./paths";
import {
  avatarFailureReason,
  deleteAvatarJob,
  downloadAvatarResult,
  getAvatarJob,
  submitAvatarJob,
} from "./avatarbatch";
import { presenter, presenterVoice, backgroundColour, MAX_AVATAR_MINUTES } from "./avatars";
import { buildTrainingSsml, countWords } from "./training";
import { WORDS_PER_MINUTE } from "./voices";
import type { TrainingContent, TrainingStage } from "./types";

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

const IN_FLIGHT: TrainingStage[] = ["submitting", "submitted", "rendering", "downloading"];

// Survives Next's dev-mode module reloads, which would otherwise start a
// second watcher for a job the first one is still polling.
const g = globalThis as unknown as { __trainingWatchers?: Set<string> };
const watching = (g.__trainingWatchers ??= new Set<string>());

const userError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    id
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
    throw userError("The transcript is empty — write something for the presenter to say.");
  }
  const minutes = estimateMinutes(c);
  if (minutes > MAX_AVATAR_MINUTES * 0.95) {
    throw userError(
      `The transcript runs about ${Math.round(minutes)} minutes; avatar videos are limited to ${MAX_AVATAR_MINUTES}. Shorten it first.`
    );
  }

  const { preset } = presenter(c.presenter);
  const voice = presenterVoice(c.voice, preset.voice);
  const ssml = buildTrainingSsml(c.sections, voice);
  if (Buffer.byteLength(ssml) > 450_000) {
    throw userError("The transcript is too long for a single avatar job. Shorten it first.");
  }

  const previous = c.progress?.synthesisId;
  const synthesisId = synthesisIdFor(id);
  writeTraining(id, { progress: { stage: "submitting", synthesisId, note: undefined } });

  try {
    await submitAvatarJob(synthesisId, ssml, {
      character: preset.character,
      style: preset.style,
      background: backgroundColour(c.background),
      description: c.title,
    });
  } catch (e) {
    writeTraining(id, {
      progress: {
        stage: c.videoUrl ? "done" : "transcript",
        synthesisId: previous,
        note: e instanceof Error ? e.message : "Could not start the render.",
      },
    });
    throw e;
  }

  writeTraining(id, {
    progress: { stage: "submitted", synthesisId, submittedAt: Date.now(), note: undefined },
  });
  if (previous && previous !== synthesisId) void deleteAvatarJob(previous);
  watch(id);
}

function watch(id: string) {
  if (watching.has(id)) return;
  watching.add(id);
  void poll(id)
    .catch((e) => {
      console.error("[training] render failed", e);
      writeTraining(id, {
        progress: {
          stage: "failed",
          note: e instanceof Error ? e.message : "The render failed.",
        },
      });
    })
    .finally(() => watching.delete(id));
}

async function poll(id: string): Promise<void> {
  for (;;) {
    const c = read(id);
    // Deleted, or superseded by something that is no longer a render.
    if (!c || !isRendering(c)) return;
    const synthesisId = c.progress.synthesisId;
    if (!synthesisId) throw new Error("The render lost track of its Azure job.");

    if (c.progress.submittedAt && Date.now() - c.progress.submittedAt > GIVE_UP_MS) {
      throw new Error("Azure did not finish the render within 90 minutes. Try again.");
    }

    let job;
    try {
      job = await getAvatarJob(synthesisId);
    } catch (e) {
      // Transient failures are retried; a permission or missing-job error is not.
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 429) throw e;
      writeTraining(id, {});
      await sleep(POLL_MS);
      continue;
    }

    if (job.status === "Failed") {
      throw new Error(await avatarFailureReason(job));
    }

    if (job.status === "Succeeded") {
      const result = job.outputs?.result;
      if (!result) throw new Error("Azure finished the render but returned no video.");
      writeTraining(id, { progress: { stage: "downloading", synthesisId } });
      fs.mkdirSync(videoDir(), { recursive: true });
      const bytes = await downloadAvatarResult(result, videoPath(id));
      const ms = job.properties?.durationInMilliseconds;
      const renderedAt = Date.now();
      writeTraining(id, {
        progress: { stage: "done", synthesisId, note: undefined },
        // Cache-busted so a re-render is not served from the browser's copy.
        videoUrl: `/api/video/${id}?v=${renderedAt}`,
        bytes,
        durationSec: ms ? Math.round(ms / 100) / 10 : undefined,
        billedSeconds: job.properties?.billingDetails?.talkingAvatarDurationSeconds,
        renderedAt,
        editedSinceRender: false,
      });
      // The copy on disk is now the only one needed.
      void deleteAvatarJob(synthesisId);
      return;
    }

    const stage: TrainingStage = job.status === "Running" ? "rendering" : "submitted";
    writeTraining(id, { progress: { stage, synthesisId } });
    await sleep(POLL_MS);
  }
}

/**
 * Resume watching a render whose watcher died with the process. Called from
 * the endpoint the player polls, so a restart heals itself on the next tick.
 */
export function resumeStalledTraining(id: string): void {
  const c = read(id);
  if (!c || !isRendering(c) || watching.has(id)) return;
  const last = Number(c.heartbeatAt ?? 0);
  if (Date.now() - last < STALL_MS) return;

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
    .prepare("SELECT id FROM artifacts WHERE type = 'training' AND notebook_id = ?")
    .all(notebookId) as unknown as { id: string }[];
  for (const r of rows) resumeStalledTraining(r.id);
}

/** Clean up Azure's copy when the artifact goes. The MP4 is removed by the caller. */
export function forgetTraining(content: string): void {
  try {
    const c = JSON.parse(content) as TrainingContent;
    if (c.progress?.synthesisId) void deleteAvatarJob(c.progress.synthesisId);
  } catch {
    /* nothing to clean */
  }
}
