/**
 * Retry, backoff and spacing for Azure Speech calls.
 *
 * The S0 tier rate-limits "Create avatar batch synthesis" hard (a 429 that says
 * "retry after N seconds"), and the service also has the occasional 5xx or
 * dropped connection. None of those mean the render is lost, so calls wait and
 * try again, within a budget, instead of failing the whole video.
 *
 * This module knows nothing about Azure itself so it can be tested with a fake
 * clock and a fake fetch.
 */

/** Statuses that are worth another try. 400, 401, 403, 404 and the rest never are. */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  408, 429, 500, 502, 503, 504,
]);

/** Retries after the first attempt, so a call is tried at most this many times plus one. */
export const DEFAULT_MAX_RETRIES = 6;
const MAX_RETRIES_LIMIT = 20;
/** Most time one call may spend waiting between attempts, in total. */
export const DEFAULT_RETRY_BUDGET_MS = 180_000;
const RETRY_BUDGET_LIMIT_MS = 900_000;
/** Backoff when the service gave no Retry-After: 2 s, 4 s, 8 s … up to the cap. */
export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 30_000;
/** Spread, added to a Retry-After, so jobs that were refused together do not return together. */
export const RETRY_AFTER_JITTER_MS = 1_000;
/** Minimum gap between two "create avatar job" calls. */
export const DEFAULT_SUBMIT_SPACING_MS = 2_000;
const SUBMIT_SPACING_LIMIT_MS = 120_000;

const wholeNumber = (raw: string | undefined, min: number, max: number) => {
  const n = Number(raw?.trim());
  return raw?.trim() && Number.isInteger(n) && n >= min ? Math.min(max, n) : undefined;
};

/** Read per call, like the rest of the Speech configuration. */
export function retryLimits(env: Record<string, string | undefined> = process.env): {
  maxRetries: number;
  maxWaitMs: number;
} {
  const seconds = wholeNumber(
    env.AZURE_SPEECH_RETRY_BUDGET_SECONDS,
    0,
    RETRY_BUDGET_LIMIT_MS / 1000,
  );
  return {
    maxRetries:
      wholeNumber(env.AZURE_SPEECH_MAX_RETRIES, 0, MAX_RETRIES_LIMIT) ??
      DEFAULT_MAX_RETRIES,
    maxWaitMs: seconds === undefined ? DEFAULT_RETRY_BUDGET_MS : seconds * 1000,
  };
}

export function submitSpacingMs(env: Record<string, string | undefined> = process.env): number {
  return (
    wholeNumber(env.AZURE_AVATAR_SUBMIT_SPACING_MS, 0, SUBMIT_SPACING_LIMIT_MS) ??
    DEFAULT_SUBMIT_SPACING_MS
  );
}

/**
 * How long the service asked us to wait, in milliseconds, or undefined.
 * Reads the Retry-After header (seconds or an HTTP date), then Azure's habit of
 * saying "Please retry after 7 seconds" in the body.
 */
export function parseRetryAfter(
  header: string | null | undefined,
  body: string | undefined,
  now: number = Date.now(),
): number | undefined {
  const h = header?.trim();
  if (h) {
    if (/^\d+(\.\d+)?$/.test(h)) return Math.round(Number(h) * 1000);
    const at = Date.parse(h);
    if (Number.isFinite(at)) return Math.max(0, at - now);
  }
  const m = /retry after (\d+(?:\.\d+)?) ?(?:seconds?|secs?|s)\b/i.exec(body ?? "");
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

/** Capped exponential backoff for the nth retry (1-based), with jitter between half and all of it. */
export function backoffMs(
  retry: number,
  random: () => number = Math.random,
  base = BACKOFF_BASE_MS,
  cap = BACKOFF_CAP_MS,
): number {
  const raw = Math.min(cap, base * 2 ** Math.max(0, retry - 1));
  return Math.round(raw * (0.5 + 0.5 * random()));
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type RetryEvent = {
  /** The attempt that just failed, from 1. */
  attempt: number;
  /** The most attempts this call will make. */
  maxAttempts: number;
  delayMs: number;
  /** HTTP status, or undefined for a dropped connection. */
  status?: number;
};

/** What to tell the person while a call waits. */
export function retryMessage(e: RetryEvent): string {
  const seconds = Math.max(1, Math.ceil(e.delayMs / 1000));
  const next = `retrying in ${seconds} s (attempt ${Math.min(e.attempt + 1, e.maxAttempts)} of ${e.maxAttempts})`;
  return e.status === 429
    ? `Azure Speech is rate limiting requests; ${next}.`
    : `Azure Speech had a temporary problem (${e.status ?? "connection lost"}); ${next}.`;
}

export type RetryOptions = {
  maxRetries?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
  /** Called before each wait. */
  onRetry?: (e: RetryEvent) => void;
  /** Called with the wait when the service rate limited the call. */
  onRateLimited?: (delayMs: number) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  random?: () => number;
};

export type RetryResult = {
  res: Response;
  attempts: number;
  waitedMs: number;
  /** True when the last response was retryable but the budget ran out. */
  exhausted: boolean;
};

/**
 * Send a request, retrying 408, 429 and 5xx responses and dropped connections.
 * Returns the response that ended the loop, which is the caller's to inspect:
 * a success, a non-retryable failure, or (exhausted) the last retryable one.
 * A connection that never recovers throws.
 */
export async function fetchWithRetry(
  send: () => Promise<Response>,
  opts: RetryOptions = {},
): Promise<RetryResult> {
  const limits = retryLimits();
  const maxRetries = opts.maxRetries ?? limits.maxRetries;
  const maxWaitMs = opts.maxWaitMs ?? limits.maxWaitMs;
  const sleep = opts.sleep ?? abortableSleep;
  const now = opts.now ?? (() => Date.now());
  const random = opts.random ?? Math.random;
  const maxAttempts = maxRetries + 1;

  let waitedMs = 0;
  for (let attempt = 1; ; attempt++) {
    let res: Response | undefined;
    let failure: unknown;
    try {
      res = await send();
    } catch (e) {
      if (opts.signal?.aborted || (e as { retryable?: boolean })?.retryable === false)
        throw e;
      failure = e;
    }
    if (res && !RETRYABLE_STATUSES.has(res.status)) {
      return { res, attempts: attempt, waitedMs, exhausted: false };
    }

    let delayMs: number;
    if (res) {
      const body = await res.clone().text().catch(() => "");
      const hint = parseRetryAfter(res.headers.get("retry-after"), body, now());
      delayMs =
        hint === undefined
          ? backoffMs(attempt, random)
          : hint + Math.round(random() * RETRY_AFTER_JITTER_MS);
    } else {
      delayMs = backoffMs(attempt, random);
    }

    if (attempt >= maxAttempts || waitedMs + delayMs > maxWaitMs) {
      if (res) return { res, attempts: attempt, waitedMs, exhausted: true };
      const reason = failure instanceof Error ? failure.message : String(failure);
      throw Object.assign(
        new Error(
          `Could not reach Azure Speech after ${attempt} attempt${attempt === 1 ? "" : "s"} (${reason}).`,
        ),
        { cause: failure },
      );
    }

    if (res?.status === 429) opts.onRateLimited?.(delayMs);
    opts.onRetry?.({ attempt, maxAttempts, delayMs, status: res?.status });
    await sleep(delayMs, opts.signal);
    waitedMs += delayMs;
  }
}

/**
 * Keeps calls to one operation apart. Each caller reserves the next slot, and a
 * rate-limited response pushes every later slot out, so jobs refused together
 * do not all come back together.
 */
export class RateGate {
  private next = 0;

  constructor(
    private readonly spacingMs: () => number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void> = abortableSleep,
  ) {}

  /** Resolves when this caller may go. The first call goes at once. */
  async acquire(signal?: AbortSignal): Promise<void> {
    const t = this.now();
    const start = Math.max(t, this.next);
    this.next = start + this.spacingMs();
    if (start > t) await this.sleep(start - t, signal);
  }

  /** The service said to wait: nothing new goes before then. */
  penalize(ms: number): void {
    this.next = Math.max(this.next, this.now() + ms);
  }

  /** How long until the gate is open to a new call. */
  remainingMs(): number {
    return Math.max(0, this.next - this.now());
  }
}
