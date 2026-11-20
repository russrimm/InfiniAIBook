/**
 * Cancellable background work, keyed by the artifact it builds.
 *
 * A build (video, motion explainer, training render, narration) registers
 * itself here with startJob, passes the returned signal to everything it
 * waits on (provider calls, renderer processes), and calls endJob in a finally.
 * POST /api/jobs/{id}/cancel aborts the signal. Jobs live in this process, like
 * the work itself: a restart ends both.
 */

export class JobCancelledError extends Error {
  readonly code = "cancelled";
  constructor(message = "Cancelled.") {
    super(message);
    this.name = "JobCancelledError";
  }
}

const g = globalThis as unknown as { __jobs?: Map<string, AbortController> };
const jobs = (g.__jobs ??= new Map<string, AbortController>());

/** Register a job and return the signal that cancels it. A job already running under this id is cancelled first. */
export function startJob(id: string): AbortSignal {
  jobs.get(id)?.abort(new JobCancelledError());
  const controller = new AbortController();
  jobs.set(id, controller);
  return controller.signal;
}

/** Forget a finished job, unless a newer one has taken its place. */
export function endJob(id: string, signal: AbortSignal) {
  const current = jobs.get(id);
  if (current && current.signal === signal) jobs.delete(id);
}

/** Cancel a running job. False when nothing was running under that id. */
export function cancelJob(id: string): boolean {
  const controller = jobs.get(id);
  if (!controller) return false;
  controller.abort(new JobCancelledError());
  return true;
}

export const isJobRunning = (id: string): boolean => jobs.has(id);

/** Whether an error means the person (or the browser) stopped the work, as opposed to it failing. */
export function isCancellation(e: unknown): boolean {
  if (e instanceof JobCancelledError) return true;
  const name = (e as { name?: string } | null)?.name;
  return name === "AbortError" || name === "APIUserAbortError" || (e as { code?: string } | null)?.code === "ABORT_ERR";
}

/** Throws JobCancelledError when the signal has been aborted. */
export function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new JobCancelledError();
}

/** Resolves after `ms`, or rejects with JobCancelledError as soon as the signal aborts. */
export function cancellableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new JobCancelledError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(new JobCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export const JOB_HEADER = "x-job-id";
const JOB_ID = /^[A-Za-z0-9_-]{8,40}$/;

/**
 * The job a request asked to be cancellable: the browser sends a fresh id in
 * the x-job-id header and can later POST /api/jobs/{id}/cancel. Without the
 * header the work simply cannot be cancelled. A closed tab does not cancel it
 * either, so a long generation still finishes while you are away.
 */
export function requestJob(req: Request): { signal: AbortSignal; end: () => void } {
  const id = req.headers.get(JOB_HEADER)?.trim() ?? "";
  if (!JOB_ID.test(id)) return { signal: new AbortController().signal, end: () => {} };
  const signal = startJob(id);
  return { signal, end: () => endJob(id, signal) };
}