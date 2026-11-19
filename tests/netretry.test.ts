import { describe, expect, it, vi } from "vitest";
import {
  CALL_MAX_ATTEMPTS,
  DROPPED_MAX_RETRIES,
  isRetryableStatus,
  retryTransient,
} from "@/lib/netretry";
import { markAfterResponse } from "@/lib/connectionerror";

/** A clock that only moves when the code under test sleeps. */
function fakeClock() {
  const slept: number[] = [];
  return {
    slept,
    sleep: vi.fn(async (ms: number) => {
      slept.push(ms);
    }),
    // No jitter, so delays are exact.
    random: () => 1,
  };
}

const dropped = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
const refused = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
const http = (status: number, headers?: unknown) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers });

const script = (...results: unknown[]) => {
  const queue = [...results];
  return vi.fn(async () => {
    if (!queue.length) throw new Error("unexpected extra call");
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
};

describe("retryTransient", () => {
  it("returns the first success without waiting", async () => {
    const clock = fakeClock();
    const fn = script("ok");
    await expect(retryTransient(fn, clock)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it("retries a dropped connection with growing backoff, then succeeds", async () => {
    const clock = fakeClock();
    const fn = script(dropped(), dropped(), "ok");
    await expect(retryTransient(fn, clock)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(clock.slept).toEqual([1_000, 2_000]);
  });

  it("gives up on a connection that keeps dropping after the dropped-retry limit", async () => {
    const clock = fakeClock();
    const err = dropped();
    const fn = script(err, err, err, err, err);
    await expect(retryTransient(fn, clock)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(DROPPED_MAX_RETRIES + 1);
  });

  it("retries an unreachable host only once, so a wrong endpoint still fails fast", async () => {
    const clock = fakeClock();
    const err = refused();
    const fn = script(err, err, err);
    await expect(retryTransient(fn, clock)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(clock.slept).toEqual([1_000]);
  });

  it("honors Retry-After from a Headers object and from a plain record", async () => {
    const clock = fakeClock();
    const fn = script(http(429, new Headers({ "retry-after": "7" })), http(429, { "retry-after": "3" }), "ok");
    await retryTransient(fn, clock);
    // 7 s and 3 s plus the (maximal here) jitter.
    expect(clock.slept).toEqual([8_000, 4_000]);
  });

  it("backs off on 5xx without a hint and gives up after the attempt limit", async () => {
    const clock = fakeClock();
    const err = http(503);
    const fn = script(...Array(CALL_MAX_ATTEMPTS).fill(err));
    await expect(retryTransient(fn, clock)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(CALL_MAX_ATTEMPTS);
    expect(clock.slept).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it("does not retry client errors", async () => {
    const clock = fakeClock();
    for (const status of [400, 401, 403, 404]) {
      const fn = script(http(status));
      await expect(retryTransient(fn, clock)).rejects.toMatchObject({ status });
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it("never repeats a call whose failure came after the server replied", async () => {
    const clock = fakeClock();
    const err = markAfterResponse(dropped());
    const fn = script(err, "would bill twice");
    await expect(retryTransient(fn, clock)).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry unrecognized errors", async () => {
    const clock = fakeClock();
    const fn = script(new Error("The image model returned no image data."));
    await expect(retryTransient(fn, clock)).rejects.toThrow("no image data");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops when the wait budget would be exceeded", async () => {
    const clock = fakeClock();
    const err = http(429, { "retry-after": "100" });
    const fn = script(err, err);
    await expect(retryTransient(fn, { ...clock, maxWaitMs: 150_000 })).rejects.toBe(err);
    // The first 100 s wait fits; a second one would pass 150 s in total.
    expect(fn).toHaveBeenCalledTimes(2);
    expect(clock.slept).toEqual([101_000]);
  });

  it("stops at once when the caller aborted", async () => {
    const clock = fakeClock();
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      throw dropped();
    });
    await expect(retryTransient(fn, { ...clock, signal: controller.signal })).rejects.toBeInstanceOf(TypeError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports each wait", async () => {
    const clock = fakeClock();
    const onRetry = vi.fn();
    await retryTransient(script(dropped(), "ok"), { ...clock, onRetry });
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, delayMs: 1_000, network: "dropped" }));
  });
});
