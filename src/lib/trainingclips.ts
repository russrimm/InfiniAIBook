import { nanoid } from "nanoid";
import { assertCanAfford, reserve } from "./budget";
import { trainingCueClipPath } from "./paths";
import {
  VideoClipError,
  clipCents,
  estimateClipCost,
  normalizeClipRequest,
  type ClipCostEstimate,
  type ClipRequest,
  type VideoProvider,
} from "./videoclip";
import { runClip } from "./videoclipjob";

/**
 * Making one video clip for one visual of a training video.
 *
 * Generation is always asked for, never implied: planning a video or rendering
 * it never starts a clip. A request runs in the background (it can take
 * minutes), the editor polls its state, and it can be cancelled. The finished
 * MP4 is stored under the training video, and the editor puts its id on the cue.
 */

export type CueClipState = {
  status: "queued" | "in_progress" | "downloading" | "completed" | "failed" | "cancelled";
  progress?: number;
  note?: string;
  error?: string;
  moderation?: boolean;
  /** Set once the clip is saved. */
  clipId?: string;
  seconds?: number;
  estimate: ClipCostEstimate;
  startedAt: number;
};

type Job = { state: CueClipState; abort: AbortController };
const g = globalThis as unknown as { __cueClipJobs?: Map<string, Job> };
const jobs = (g.__cueClipJobs ??= new Map<string, Job>());

const keyOf = (trainingId: string, cueId: string) => `${trainingId}:${cueId}`;
const FINISHED = new Set(["completed", "failed", "cancelled"]);
/** Finished states are kept briefly so a poll that was in flight still sees the result. */
const KEEP_MS = 10 * 60_000;

export const cueClipState = (trainingId: string, cueId: string): CueClipState | null =>
  jobs.get(keyOf(trainingId, cueId))?.state ?? null;

export function cancelCueClip(trainingId: string, cueId: string): boolean {
  const job = jobs.get(keyOf(trainingId, cueId));
  if (!job || FINISHED.has(job.state.status)) return false;
  job.abort.abort();
  return true;
}

export type StartCueClip = {
  trainingId: string;
  cueId: string;
  provider: VideoProvider;
  /** The raw request body: prompt, aspect, seconds, resolution. */
  body: Record<string, unknown>;
};

export class CueClipBusyError extends Error {}

/** Validate, check the budget, and start. Throws a VideoClipError for a bad request. */
export function startCueClip(args: StartCueClip): CueClipState {
  const { trainingId, cueId, provider, body } = args;
  const key = keyOf(trainingId, cueId);
  const existing = jobs.get(key);
  if (existing && !FINISHED.has(existing.state.status)) {
    throw new CueClipBusyError("A clip is already being made for this visual. Cancel it first to start again.");
  }

  const caps = provider.capabilities();
  const parsed = normalizeClipRequest(caps, {
    prompts: [body.prompt],
    aspect: body.aspect,
    duration: body.seconds,
    resolution: body.resolution,
    variants: 1,
  });
  if (!parsed.ok) throw new VideoClipError(parsed.error, { code: "invalid" });
  const request: ClipRequest = parsed.value;
  const estimate = estimateClipCost(caps, request);
  assertCanAfford(estimate.totalCents);

  const abort = new AbortController();
  const state: CueClipState = { status: "queued", estimate, startedAt: Date.now() };
  jobs.set(key, { state, abort });
  for (const [k, j] of jobs) if (FINISHED.has(j.state.status) && Date.now() - j.state.startedAt > KEEP_MS) jobs.delete(k);

  const clipId = nanoid(12);
  void runClip({
    provider,
    request,
    prompt: request.prompts[0],
    dest: trainingCueClipPath(trainingId, clipId, "mp4"),
    posterDest: trainingCueClipPath(trainingId, clipId, "jpg"),
    signal: abort.signal,
    reserve: () => reserve("video", clipCents(caps, request.duration, request.resolution)),
    onUpdate: (p) => {
      state.status = p.status;
      if (p.progress !== undefined) state.progress = p.progress;
      state.note = p.message;
    },
  }).then(
    (result) => {
      state.status = "completed";
      state.progress = 100;
      state.note = undefined;
      state.clipId = clipId;
      state.seconds = request.duration;
      // The copy kept at the provider is no use once the file is saved here.
      void provider.remove?.(result.remoteId).catch(() => {});
    },
    (e: unknown) => {
      const err = e instanceof VideoClipError ? e : new VideoClipError(e instanceof Error ? e.message : String(e));
      state.note = undefined;
      if (err.detail.cancelled) {
        state.status = "cancelled";
      } else {
        state.status = "failed";
        state.error = err.message;
        if (err.detail.moderation) state.moderation = true;
      }
    },
  );
  return state;
}
