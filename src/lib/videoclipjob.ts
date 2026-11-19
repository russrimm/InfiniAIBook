import { classifyNetworkError, failedAfterResponse, networkErrorCode } from "./connectionerror";
import { retryTransient, type CallRetryOptions } from "./netretry";
import { abortableSleep, backoffMs } from "./speechretry";
import {
  VideoClipError,
  type ClipCapabilities,
  type ClipRequest,
  type RemoteJob,
  type VideoProvider,
} from "./videoclip";
import { DownloadTooLargeError, type HttpStatusError } from "./videohttp";

/**
 * Drives one clip from "submit" to "MP4 on disk", whatever the provider.
 *
 * Retry, polling, cancellation and error wording live here so every provider
 * behaves the same: a 429 waits as long as Retry-After says, a transient 5xx
 * or dropped connection is tried again within a bounded budget, a prompt the
 * provider refuses is reported as a refusal rather than retried, and a cancel
 * stops the job and asks the provider to delete what it made.
 *
 * Time and sleeping are injectable so the state machine runs under a fake clock.
 */

export const DEFAULT_POLL_MS = 5_000;
export const MAX_POLL_MS = 15_000;
export const DEFAULT_CLIP_TIMEOUT_MS = 20 * 60_000;
export const DEFAULT_MAX_CLIP_BYTES = 200 * 1024 * 1024;

export type ClipProgress = {
  status: "queued" | "in_progress" | "downloading" | "completed";
  /** 0 to 100 when the provider says. */
  progress?: number;
  remoteId?: string;
  /** A note for the person, such as that a retry is waiting. */
  message?: string;
};

export type RunClipOptions = {
  provider: VideoProvider;
  request: ClipRequest;
  prompt: string;
  dest: string;
  /** Where to save a still, when the provider makes one. */
  posterDest?: string;
  signal?: AbortSignal;
  onUpdate?: (p: ClipProgress) => void;
  /** Count this clip against the daily budget; throws when it is over. Called just before the provider is. */
  reserve?: () => void;
  pollMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
  retry?: CallRetryOptions;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
};

export type ClipResult = { remoteId: string; bytes: number; poster: boolean };

const num = (raw: string | undefined, fallback: number, min = 0): number => {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isFinite(n) && n > min ? n : fallback;
};

/** Operator limits, read per call so a changed .env.local applies after a restart. */
export function clipLimits(env: Record<string, string | undefined> = process.env) {
  return {
    pollMs: Math.round(num(env.VIDEO_CLIP_POLL_SECONDS, DEFAULT_POLL_MS / 1000) * 1000),
    timeoutMs: Math.round(num(env.VIDEO_CLIP_TIMEOUT_MIN, DEFAULT_CLIP_TIMEOUT_MS / 60_000) * 60_000),
    maxBytes: Math.round(num(env.VIDEO_CLIP_MAX_MB, DEFAULT_MAX_CLIP_BYTES / 1024 / 1024) * 1024 * 1024),
    concurrency: Math.min(4, Math.max(1, Math.floor(num(env.VIDEO_CLIP_CONCURRENCY, 2)))),
  };
}

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
};

const isAbort = (e: unknown, signal?: AbortSignal): boolean =>
  Boolean(signal?.aborted) || (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message)));

/** Turn any failure into one a person can act on. Never includes the prompt. */
export function describeClipError(e: unknown, caps: Pick<ClipCapabilities, "kind" | "label" | "model">): VideoClipError {
  if (e instanceof VideoClipError) return e;
  if (e instanceof Error && e.name === "BudgetExceededError") {
    return new VideoClipError(e.message, { code: "budget" });
  }
  if (e instanceof DownloadTooLargeError) return new VideoClipError(e.message, { code: "too_large" });

  const status = statusOf(e);
  const failure = (e as HttpStatusError)?.failure;
  const raw = e instanceof Error ? e.message : String(e);
  const where = caps.label;

  if (failure?.moderation) {
    return new VideoClipError(
      `${where} declined this prompt on content grounds: ${failure.message} Reword it and try again; nothing was saved.`,
      { code: failure.code ?? "moderation", moderation: true, status },
    );
  }
  if (status === 401 || status === 403) {
    const fix =
      caps.kind === "azure"
        ? "Run 'az login' and make sure your identity has the 'Cognitive Services OpenAI User' role on the resource, or set AZURE_OPENAI_API_KEY."
        : caps.kind === "gemini"
          ? "Check GEMINI_API_KEY. Gemini video needs a key on the paid tier."
          : "Check AI_VIDEO_API_KEY (or OPENAI_API_KEY).";
    return new VideoClipError(`${where} rejected the credential. ${fix}`, { status, code: "auth" });
  }
  if (status === 404) {
    return new VideoClipError(
      `${where} could not find the video model "${caps.model}". Check AI_VIDEO_MODEL${caps.kind === "azure" ? " or AZURE_OPENAI_VIDEO_DEPLOYMENT" : ""}. Sora 2 is retired, so a deployment of it will not work.`,
      { status, code: "model_not_found" },
    );
  }
  if (status === 429) {
    return new VideoClipError(
      `${where} is rate limiting video requests and the automatic retries did not clear it. Wait a few minutes, make fewer clips at once, or raise the quota.`,
      { status, code: "rate_limited" },
    );
  }
  if (status !== undefined && status >= 500) {
    return new VideoClipError(`${where} had a server problem (${status}) and retrying did not help. Try again later. ${raw.replace(/^.*?:\s*/, "").slice(0, 200)}`.trim(), { status });
  }
  if (status === 400 || status === 422) {
    return new VideoClipError(raw.replace(/\s+/g, " ").slice(0, 400), { status, code: failure?.code ?? "invalid" });
  }

  const network = classifyNetworkError(e);
  if (network === "unreachable") {
    return new VideoClipError(`Could not reach ${where}. Check the endpoint, your network, VPN or proxy.`, { code: "unreachable" });
  }
  if (network === "dropped") {
    const code = networkErrorCode(e);
    return new VideoClipError(
      failedAfterResponse(e)
        ? `The connection to ${where} dropped while the clip was coming back${code ? ` (${code})` : ""}, so it was lost and may have been billed. Try again.`
        : `The connection to ${where} was closed or timed out${code ? ` (${code})` : ""} before a reply arrived. It is usually safe to retry.`,
      { code: "dropped" },
    );
  }
  return new VideoClipError(raw.slice(0, 400));
}

/** Downloads cost nothing, so a drop is simply tried again, unlike the request that makes the clip. */
async function withDownloadRetry<T>(
  fn: () => Promise<T>,
  o: { signal?: AbortSignal; sleep: (ms: number, signal?: AbortSignal) => Promise<void> },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const status = statusOf(e);
      const transient = status === undefined ? classifyNetworkError(e) !== null || /dropped/i.test(String((e as Error)?.message)) : status === 429 || status >= 500;
      if (o.signal?.aborted || !transient || attempt >= 3 || e instanceof DownloadTooLargeError) throw e;
      await o.sleep(backoffMs(attempt, Math.random, 1_000, 8_000), o.signal);
    }
  }
}

export async function runClip(opts: RunClipOptions): Promise<ClipResult> {
  const { provider, request, prompt, signal } = opts;
  const caps = provider.capabilities();
  const limits = clipLimits();
  const sleep = opts.sleep ?? abortableSleep;
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? limits.timeoutMs;
  const maxBytes = opts.maxBytes ?? limits.maxBytes;
  const update = (p: ClipProgress) => opts.onUpdate?.(p);
  let remoteId: string | undefined;

  const retryOpts = (extra: CallRetryOptions = {}): CallRetryOptions => ({
    signal,
    sleep,
    onRetry: ({ delayMs, status, error }) => {
      const why = status === 429 ? "rate limited" : status ? `temporary error ${status}` : "connection lost";
      const seconds = Math.max(1, Math.round(delayMs / 1000));
      console.warn(`[videoclip] ${why}; retrying in ${seconds}s (${networkErrorCode(error) ?? status ?? "transport"})`);
      update({ status: "queued", remoteId, message: `${caps.label} is ${status === 429 ? "rate limiting requests" : "having a temporary problem"}; retrying in ${seconds} s.` });
    },
    ...opts.retry,
    ...extra,
  });

  try {
    if (signal?.aborted) throw new VideoClipError("Cancelled.", { cancelled: true });
    opts.reserve?.();
    update({ status: "queued" });

    // Submitting is what bills, so a connection that dropped is tried at most once more.
    let job: RemoteJob = await retryTransient(() => provider.start(request, prompt, { signal }), retryOpts({ maxDroppedRetries: 1 }));
    remoteId = job.id;
    update({ status: job.status === "completed" ? "completed" : job.status === "queued" ? "queued" : "in_progress", progress: job.progress, remoteId });

    const startedAt = now();
    let wait = opts.pollMs ?? limits.pollMs;
    while (job.status === "queued" || job.status === "in_progress") {
      if (now() - startedAt > timeoutMs) {
        throw new VideoClipError(
          `${caps.label} did not finish the clip within ${Math.round(timeoutMs / 60_000)} minutes, so it was stopped. It may still be billed. Raise VIDEO_CLIP_TIMEOUT_MIN for slow models.`,
          { code: "timeout" },
        );
      }
      await sleep(wait, signal);
      wait = Math.min(MAX_POLL_MS, Math.round(wait * 1.25));
      job = await retryTransient(() => provider.poll(job.id, { signal }), retryOpts());
      update({ status: job.status === "queued" ? "queued" : "in_progress", progress: job.progress, remoteId });
    }

    if (job.status === "failed") {
      throw new VideoClipError(
        job.error?.moderation
          ? `${caps.label} declined this prompt on content grounds: ${job.error.message} Reword it and try again.`
          : `${caps.label} could not make this clip: ${job.error?.message ?? "the job failed."}`,
        { code: job.error?.code, moderation: job.error?.moderation },
      );
    }

    update({ status: "downloading", progress: 100, remoteId });
    const bytes = await withDownloadRetry(() => provider.download(job, opts.dest, maxBytes, { signal }), { signal, sleep });
    let poster = false;
    if (opts.posterDest && provider.poster) {
      poster = await provider.poster(job, opts.posterDest, maxBytes, { signal }).catch(() => false);
    }
    update({ status: "completed", progress: 100, remoteId });
    return { remoteId: job.id, bytes, poster };
  } catch (e) {
    if (isAbort(e, signal) || (e instanceof VideoClipError && e.detail.cancelled)) {
      if (remoteId) void provider.remove?.(remoteId).catch(() => {});
      throw new VideoClipError("Cancelled.", { cancelled: true });
    }
    const err = describeClipError(e, caps);
    // A job that failed or timed out holds no useful asset; ask the provider to drop it.
    if (remoteId && err.detail.code !== "budget") void provider.remove?.(remoteId).catch(() => {});
    throw err;
  }
}
