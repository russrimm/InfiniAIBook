/**
 * Retry for calls to the model provider: a 429, a 5xx, or a connection that
 * dropped before any reply came back.
 *
 * Bounded three ways so a bad day cannot multiply cost or hang a request:
 * a cap on attempts per call, a tighter one for dropped connections (the
 * request may have been billed even though the reply never arrived), and a
 * total wait budget. A failure that happened after the server had replied is
 * never repeated, because that would bill a second image for the same prompt.
 *
 * Knows nothing about Azure or the SDK, so it runs under a fake clock.
 */
import { abortableSleep, backoffMs, parseRetryAfter, RETRY_AFTER_JITTER_MS } from "./speechretry";
import { classifyNetworkError, failedAfterResponse, type NetworkFailure } from "./connectionerror";

export const CALL_MAX_ATTEMPTS = 5;
/** Extra tries after the first when the connection dropped or timed out mid-request. */
export const DROPPED_MAX_RETRIES = 2;
/** Extra tries when the host could not be reached at all; a DNS blip or a VPN reconnect, not a wrong endpoint. */
export const UNREACHABLE_MAX_RETRIES = 1;
export const CALL_MAX_WAIT_MS = 180_000;

export type CallRetryEvent = {
  /** The attempt that just failed, from 1. */
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  status?: number;
  network?: NetworkFailure;
  error: unknown;
};

export type CallRetryOptions = {
  maxAttempts?: number;
  maxDroppedRetries?: number;
  maxUnreachableRetries?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
  onRetry?: (e: CallRetryEvent) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

const statusOf = (e: unknown): number | undefined => {
  const s = (e as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
};

/** The SDK exposes headers as a Headers object; raw fetch errors here use a plain record. */
function retryAfterHeader(e: unknown): string | undefined {
  const h = (e as { headers?: unknown })?.headers;
  if (!h) return undefined;
  if (typeof (h as Headers).get === "function") return (h as Headers).get("retry-after") ?? undefined;
  const v = (h as Record<string, unknown>)["retry-after"];
  return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
}

export const isRetryableStatus = (status: number | undefined): boolean =>
  status !== undefined && (status === 408 || status === 429 || status >= 500);

export async function retryTransient<T>(
  fn: (attempt: number) => Promise<T>,
  opts: CallRetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? CALL_MAX_ATTEMPTS;
  const maxDropped = opts.maxDroppedRetries ?? DROPPED_MAX_RETRIES;
  const maxUnreachable = opts.maxUnreachableRetries ?? UNREACHABLE_MAX_RETRIES;
  const maxWaitMs = opts.maxWaitMs ?? CALL_MAX_WAIT_MS;
  const sleep = opts.sleep ?? abortableSleep;
  const random = opts.random ?? Math.random;

  let waitedMs = 0;
  let dropped = 0;
  let unreachable = 0;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (opts.signal?.aborted || (e as { retryable?: boolean })?.retryable === false) throw e;
      if (failedAfterResponse(e) || attempt >= maxAttempts) throw e;

      const status = statusOf(e);
      let network: NetworkFailure | undefined;
      let delayMs: number;
      if (isRetryableStatus(status)) {
        const hint = parseRetryAfter(retryAfterHeader(e), undefined);
        delayMs =
          hint === undefined
            ? backoffMs(attempt, random, 1_000, 30_000)
            : hint + Math.round(random() * RETRY_AFTER_JITTER_MS);
      } else if (status === undefined) {
        network = classifyNetworkError(e) ?? undefined;
        if (network === "dropped" && dropped < maxDropped) dropped++;
        else if (network === "unreachable" && unreachable < maxUnreachable) unreachable++;
        else throw e;
        delayMs = backoffMs(dropped + unreachable, random, 1_000, 8_000);
      } else {
        throw e;
      }

      if (waitedMs + delayMs > maxWaitMs) throw e;
      opts.onRetry?.({ attempt, maxAttempts, delayMs, status, network, error: e });
      await sleep(delayMs, opts.signal);
      waitedMs += delayMs;
    }
  }
}
