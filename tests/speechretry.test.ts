import { describe, expect, it, vi } from "vitest";
import {
  BACKOFF_CAP_MS,
  RateGate,
  backoffMs,
  fetchWithRetry,
  parseRetryAfter,
  retryLimits,
  retryMessage,
  submitSpacingMs,
} from "@/lib/speechretry";

/** A clock that only moves when the code under test sleeps. */
function fakeClock() {
  let t = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      slept.push(ms);
      t += ms;
    }),
    // No jitter, so delays are exact.
    random: () => 0,
  };
}

const reply = (status: number, headers: Record<string, string> = {}, body = "") =>
  new Response(body || null, { status, headers });

const sender = (...results: (Response | Error)[]) => {
  const queue = [...results];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
};

describe("parseRetryAfter", () => {
  it("reads seconds, fractional seconds and HTTP dates", () => {
    expect(parseRetryAfter("7", undefined)).toBe(7000);
    expect(parseRetryAfter("1.5", undefined)).toBe(1500);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", undefined, now)).toBe(30_000);
    expect(parseRetryAfter("Wed, 31 Dec 2025 23:00:00 GMT", undefined, now)).toBe(0);
  });

  it("falls back to the seconds Azure puts in the body", () => {
    const body = JSON.stringify({ error: { message: "Please retry after 7 seconds. Please contact Azure support" } });
    expect(parseRetryAfter(null, body)).toBe(7000);
    expect(parseRetryAfter("garbage", "Retry after 1 second")).toBe(1000);
  });

  it("says nothing when there is no hint", () => {
    expect(parseRetryAfter(null, "")).toBeUndefined();
    expect(parseRetryAfter("soon", "try later")).toBeUndefined();
  });
});

describe("backoffMs", () => {
  it("doubles up to the cap, with jitter between half and all of it", () => {
    expect([1, 2, 3].map((n) => backoffMs(n, () => 1))).toEqual([2000, 4000, 8000]);
    expect(backoffMs(10, () => 1)).toBe(BACKOFF_CAP_MS);
    expect(backoffMs(2, () => 0)).toBe(2000);
  });
});

describe("fetchWithRetry", () => {
  it("returns a success without waiting", async () => {
    const clock = fakeClock();
    const send = sender(reply(200));
    const out = await fetchWithRetry(send, clock);
    expect(out).toMatchObject({ attempts: 1, waitedMs: 0, exhausted: false });
    expect(out.res.status).toBe(200);
    expect(clock.slept).toEqual([]);
  });

  it("waits the Retry-After seconds on a 429, then succeeds", async () => {
    const clock = fakeClock();
    const waits: string[] = [];
    const out = await fetchWithRetry(sender(reply(429, { "Retry-After": "7" }), reply(201)), {
      ...clock,
      onRetry: (e) => waits.push(retryMessage(e)),
    });
    expect(out.res.status).toBe(201);
    expect(out.attempts).toBe(2);
    expect(clock.slept).toEqual([7000]);
    expect(waits).toEqual([
      "Azure Speech is rate limiting requests; retrying in 7 s (attempt 2 of 7).",
    ]);
  });

  it("honors a Retry-After HTTP date", async () => {
    const clock = fakeClock();
    const at = new Date(clock.now() + 12_000).toUTCString();
    await fetchWithRetry(sender(reply(429, { "Retry-After": at }), reply(200)), clock);
    expect(clock.slept[0]).toBeGreaterThan(10_000);
    expect(clock.slept[0]).toBeLessThanOrEqual(12_000);
  });

  it("uses the body's seconds when there is no header", async () => {
    const clock = fakeClock();
    await fetchWithRetry(
      sender(reply(429, {}, "Please retry after 7 seconds."), reply(200)),
      clock,
    );
    expect(clock.slept).toEqual([7000]);
  });

  it("backs off exponentially on a 429 with no hint", async () => {
    const clock = fakeClock();
    await fetchWithRetry(sender(reply(429), reply(429), reply(429), reply(200)), {
      ...clock,
      random: () => 1,
    });
    expect(clock.slept).toEqual([2000, 4000, 8000]);
  });

  it.each([408, 500, 502, 503, 504])("retries a transient %i", async (status) => {
    const clock = fakeClock();
    const out = await fetchWithRetry(sender(reply(status), reply(200)), clock);
    expect(out.res.status).toBe(200);
    expect(clock.slept).toHaveLength(1);
  });

  it("retries a dropped connection", async () => {
    const clock = fakeClock();
    const out = await fetchWithRetry(
      sender(new TypeError("fetch failed"), reply(200)),
      clock,
    );
    expect(out.res.status).toBe(200);
    expect(clock.slept).toHaveLength(1);
  });

  it.each([400, 401, 403, 404, 409])("never retries a %i", async (status) => {
    const clock = fakeClock();
    const send = sender(reply(status));
    const out = await fetchWithRetry(send, clock);
    expect(out.res.status).toBe(status);
    expect(out.exhausted).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(clock.slept).toEqual([]);
  });

  it("gives up after the attempt budget and returns the last response", async () => {
    const clock = fakeClock();
    const send = sender(reply(429), reply(429), reply(429), reply(429));
    const out = await fetchWithRetry(send, { ...clock, maxRetries: 3 });
    expect(out).toMatchObject({ attempts: 4, exhausted: true });
    expect(out.res.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("gives up at once when the service asks for more than the time budget", async () => {
    const clock = fakeClock();
    const send = sender(reply(429, { "Retry-After": "600" }));
    const out = await fetchWithRetry(send, { ...clock, maxWaitMs: 60_000 });
    expect(out.exhausted).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(clock.slept).toEqual([]);
  });

  it("stops when the waits add up past the time budget", async () => {
    const clock = fakeClock();
    const send = sender(...Array.from({ length: 10 }, () => reply(429, { "Retry-After": "20" })));
    const out = await fetchWithRetry(send, { ...clock, maxRetries: 10, maxWaitMs: 50_000 });
    expect(out.exhausted).toBe(true);
    expect(clock.slept).toEqual([20_000, 20_000]);
    expect(out.waitedMs).toBe(40_000);
  });

  it("throws when the connection never comes back", async () => {
    const clock = fakeClock();
    const send = sender(...Array.from({ length: 3 }, () => new TypeError("fetch failed")));
    await expect(fetchWithRetry(send, { ...clock, maxRetries: 2 })).rejects.toThrow(
      /Could not reach Azure Speech after 3 attempts \(fetch failed\)/,
    );
  });

  it("does not retry an error marked as not retryable", async () => {
    const clock = fakeClock();
    const send = sender(Object.assign(new Error("no credential"), { retryable: false }));
    await expect(fetchWithRetry(send, clock)).rejects.toThrow("no credential");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("stops waiting when the signal aborts", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const send = sender(reply(429, { "Retry-After": "60" }), reply(200));
      const pending = fetchWithRetry(send, { signal: controller.signal, random: () => 0 });
      const settled = expect(pending).rejects.toThrow(/cancel/);
      await vi.advanceTimersByTimeAsync(5_000);
      controller.abort(new Error("cancelled"));
      await settled;
      expect(send).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("retryMessage", () => {
  it("names the rate limit, the wait and the attempt", () => {
    expect(retryMessage({ attempt: 2, maxAttempts: 7, delayMs: 6500, status: 429 })).toBe(
      "Azure Speech is rate limiting requests; retrying in 7 s (attempt 3 of 7).",
    );
  });

  it("describes other failures without calling them rate limits", () => {
    expect(retryMessage({ attempt: 1, maxAttempts: 4, delayMs: 2000, status: 503 })).toBe(
      "Azure Speech had a temporary problem (503); retrying in 2 s (attempt 2 of 4).",
    );
    expect(retryMessage({ attempt: 1, maxAttempts: 4, delayMs: 100 })).toContain("connection lost");
  });
});

describe("retryLimits and submitSpacingMs", () => {
  it("defaults, and reads overrides from the environment", () => {
    expect(retryLimits({})).toEqual({ maxRetries: 6, maxWaitMs: 180_000 });
    expect(
      retryLimits({ AZURE_SPEECH_MAX_RETRIES: "2", AZURE_SPEECH_RETRY_BUDGET_SECONDS: "45" }),
    ).toEqual({ maxRetries: 2, maxWaitMs: 45_000 });
    expect(retryLimits({ AZURE_SPEECH_MAX_RETRIES: "0" }).maxRetries).toBe(0);
    expect(retryLimits({ AZURE_SPEECH_MAX_RETRIES: "999" }).maxRetries).toBe(20);
  });

  it("ignores values that are not whole numbers", () => {
    expect(retryLimits({ AZURE_SPEECH_MAX_RETRIES: "lots", AZURE_SPEECH_RETRY_BUDGET_SECONDS: "-3" })).toEqual({
      maxRetries: 6,
      maxWaitMs: 180_000,
    });
    expect(submitSpacingMs({})).toBe(2000);
    expect(submitSpacingMs({ AZURE_AVATAR_SUBMIT_SPACING_MS: "0" })).toBe(0);
    expect(submitSpacingMs({ AZURE_AVATAR_SUBMIT_SPACING_MS: "x" })).toBe(2000);
  });
});

describe("RateGate", () => {
  it("lets the first call go at once and spaces the rest", async () => {
    const clock = fakeClock();
    const gate = new RateGate(() => 2000, clock.now, clock.sleep);
    await gate.acquire();
    await gate.acquire();
    await gate.acquire();
    expect(clock.slept).toEqual([2000, 2000]);
  });

  it("spaces callers that arrive together", async () => {
    const clock = fakeClock();
    const waits: number[] = [];
    // The clock stands still, as it does when callers arrive in the same instant.
    const gate = new RateGate(() => 1000, clock.now, async (ms) => void waits.push(ms));
    await Promise.all([gate.acquire(), gate.acquire(), gate.acquire()]);
    expect(waits).toEqual([1000, 2000]);
  });

  it("does not delay a call that comes after the spacing has passed", async () => {
    const clock = fakeClock();
    const gate = new RateGate(() => 1000, clock.now, clock.sleep);
    await gate.acquire();
    await clock.sleep(5000);
    clock.slept.length = 0;
    await gate.acquire();
    expect(clock.slept).toEqual([]);
  });

  it("holds later calls back when the service says to slow down", async () => {
    const clock = fakeClock();
    const gate = new RateGate(() => 1000, clock.now, clock.sleep);
    gate.penalize(7000);
    expect(gate.remainingMs()).toBe(7000);
    await gate.acquire();
    expect(clock.slept).toEqual([7000]);
  });

  it("is off with zero spacing", async () => {
    const clock = fakeClock();
    const gate = new RateGate(() => 0, clock.now, clock.sleep);
    await gate.acquire();
    await gate.acquire();
    expect(clock.slept).toEqual([]);
  });
});
