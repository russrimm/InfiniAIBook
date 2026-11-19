import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clipLimits, describeClipError, runClip, type ClipProgress } from "@/lib/videoclipjob";
import { VideoClipError, type ClipCapabilities, type ClipRequest, type RemoteJob, type VideoProvider } from "@/lib/videoclip";
import { BudgetExceededError } from "@/lib/budget";
import { MP4 } from "./videofixtures";

const caps: ClipCapabilities = {
  kind: "openai",
  label: "Test video",
  model: "vid-1",
  aspects: ["16:9"],
  durations: [4],
  resolutions: [{ id: "720p", label: "720p" }],
  defaultResolution: "720p",
  maxVariants: 1,
  maxClips: 3,
  referenceImage: false,
  prices: { "720p": 0.1 },
  priceNote: "",
};
const request: ClipRequest = { prompts: ["x"], aspect: "16:9", duration: 4, resolution: "720p", variants: 1 };

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clip-job-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const http = (status: number, headers: Record<string, string> = {}, failure?: unknown) =>
  Object.assign(new Error(`HTTP ${status}`), { status, headers, failure });

/** A provider whose replies are scripted, with a download that really writes the file. */
function provider(opts: { start?: (RemoteJob | Error)[]; poll?: (RemoteJob | Error)[]; download?: (() => Promise<number>)[] } = {}) {
  const start = [...(opts.start ?? [{ id: "job1", status: "queued" } as RemoteJob])];
  const poll = [...(opts.poll ?? [{ id: "job1", status: "completed" } as RemoteJob])];
  const dl = [...(opts.download ?? [])];
  const next = async <T>(q: (T | Error)[]) => {
    const v = q.shift();
    if (v === undefined) throw new Error("unexpected extra call");
    if (v instanceof Error) throw v;
    return v;
  };
  const p = {
    kind: "openai",
    capabilities: () => caps,
    start: vi.fn(() => next<RemoteJob>(start)),
    poll: vi.fn(() => next<RemoteJob>(poll)),
    download: vi.fn(async (_job: RemoteJob, dest: string) => {
      const step = dl.shift();
      if (step) return step();
      fs.writeFileSync(dest, MP4);
      return MP4.length;
    }),
    poster: vi.fn(async (_job: RemoteJob, dest: string) => {
      fs.writeFileSync(dest, "jpg");
      return true;
    }),
    remove: vi.fn(async () => {}),
  };
  return p as typeof p & VideoProvider;
}

const clock = () => {
  let t = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      slept.push(ms);
      t += ms;
    }),
  };
};

const run = (p: VideoProvider, extra: Partial<Parameters<typeof runClip>[0]> = {}) => {
  const c = clock();
  const updates: ClipProgress[] = [];
  const promise = runClip({
    provider: p,
    request,
    prompt: "a secret prompt",
    dest: path.join(dir, "clip.mp4"),
    posterDest: path.join(dir, "clip.jpg"),
    onUpdate: (u) => updates.push(u),
    sleep: c.sleep,
    now: c.now,
    pollMs: 1000,
    retry: { random: () => 1 },
    ...extra,
  });
  return { promise, c, updates };
};

describe("runClip polling state machine", () => {
  it("submits, polls until completed with progress, downloads, and saves a poster", async () => {
    const p = provider({
      poll: [
        { id: "job1", status: "in_progress", progress: 20 },
        { id: "job1", status: "in_progress", progress: 70 },
        { id: "job1", status: "completed", progress: 100 },
      ],
    });
    const { promise, c, updates } = run(p);
    const result = await promise;

    expect(result).toEqual({ remoteId: "job1", bytes: MP4.length, poster: true });
    expect(p.poll).toHaveBeenCalledTimes(3);
    expect(updates.map((u) => u.status)).toEqual(["queued", "queued", "in_progress", "in_progress", "in_progress", "downloading", "completed"]);
    expect(updates.filter((u) => u.progress !== undefined).map((u) => u.progress)).toEqual([20, 70, 100, 100, 100]);
    // The wait grows, capped, so a long job is not polled every second.
    expect(c.slept).toEqual([1000, 1250, 1563]);
    expect(fs.existsSync(path.join(dir, "clip.mp4"))).toBe(true);
    expect(p.remove).not.toHaveBeenCalled();
  });

  it("finishes at once when the provider returns a finished job, without polling", async () => {
    const p = provider({ start: [{ id: "j", status: "completed", inline: MP4 }] });
    await run(p).promise;
    expect(p.poll).not.toHaveBeenCalled();
    expect(p.download).toHaveBeenCalledTimes(1);
  });

  it("reports a provider failure with its message, flags a refusal as moderation, and cleans up remotely", async () => {
    const p = provider({
      poll: [{ id: "job1", status: "failed", error: { code: "moderation_blocked", message: "Real people cannot be generated.", moderation: true } }],
    });
    const err = await run(p).promise.catch((e) => e);
    expect(err).toBeInstanceOf(VideoClipError);
    expect(err.message).toMatch(/declined this prompt on content grounds: Real people cannot be generated/);
    expect(err.detail.moderation).toBe(true);
    expect(p.download).not.toHaveBeenCalled();
    expect(p.remove).toHaveBeenCalledWith("job1");
    expect(JSON.stringify(err.message)).not.toContain("a secret prompt");
  });

  it("reports a non-moderation failure plainly", async () => {
    const p = provider({ poll: [{ id: "job1", status: "failed", error: { message: "Internal render error" } }] });
    const err = await run(p).promise.catch((e) => e);
    expect(err.message).toMatch(/could not make this clip: Internal render error/);
    expect(err.detail.moderation).toBeFalsy();
  });

  it("stops waiting after the timeout and says it may still be billed", async () => {
    const forever = Array.from({ length: 50 }, () => ({ id: "job1", status: "in_progress" }) as RemoteJob);
    const p = provider({ poll: forever });
    const err = await run(p, { timeoutMs: 5_000 }).promise.catch((e) => e);
    expect(err.message).toMatch(/did not finish the clip within/);
    expect(err.message).toMatch(/may still be billed/);
    expect(err.detail.code).toBe("timeout");
    expect(p.remove).toHaveBeenCalledWith("job1");
  });
});

describe("runClip retries", () => {
  it("waits as long as Retry-After says on a 429, then succeeds", async () => {
    const p = provider({ start: [http(429, { "retry-after": "7" }), { id: "job1", status: "queued" }] });
    const { promise, c, updates } = run(p);
    await promise;
    expect(p.start).toHaveBeenCalledTimes(2);
    // 7 s from the header, plus the jitter (random() is pinned to 1 so jitter is the full 1 s).
    expect(c.slept[0]).toBe(8000);
    expect(updates.some((u) => /rate limiting/.test(u.message ?? ""))).toBe(true);
  });

  it("retries a transient 503 on polling and keeps going", async () => {
    const p = provider({ poll: [http(503), { id: "job1", status: "completed" }] });
    await run(p).promise;
    expect(p.poll).toHaveBeenCalledTimes(2);
  });

  it("tries a dropped connection while submitting at most once more", async () => {
    const drop = () => new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
    const p = provider({ start: [drop(), drop(), { id: "never", status: "queued" }] });
    const err = await run(p).promise.catch((e) => e);
    expect(p.start).toHaveBeenCalledTimes(2);
    expect(err.message).toMatch(/closed or timed out/);
    expect(err.detail.code).toBe("dropped");
  });

  it("never repeats a submit that the server answered", async () => {
    const p = provider({ start: [http(400, {}, { code: "invalid", message: "size not supported" })] });
    const err = await run(p).promise.catch((e) => e);
    expect(p.start).toHaveBeenCalledTimes(1);
    expect(err.detail.status).toBe(400);
  });

  it("gives up on a 429 that never clears, with an actionable message", async () => {
    const p = provider({ start: Array.from({ length: 6 }, () => http(429, { "retry-after": "1" })) });
    const err = await run(p).promise.catch((e) => e);
    expect(err.message).toMatch(/rate limiting video requests/);
    expect(err.detail.code).toBe("rate_limited");
  });

  it("downloads again after a dropped download, since that costs nothing", async () => {
    const drop = async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
    };
    const p = provider({ download: [drop] });
    const result = await run(p).promise;
    expect(p.download).toHaveBeenCalledTimes(2);
    expect(result.bytes).toBe(MP4.length);
  });
});

describe("runClip budget and cancel", () => {
  it("reserves before calling the provider and never calls it when over budget", async () => {
    const order: string[] = [];
    const p = provider();
    p.start.mockImplementation(async () => {
      order.push("start");
      return { id: "job1", status: "completed" } as RemoteJob;
    });
    await run(p, { reserve: () => order.push("reserve") }).promise;
    expect(order).toEqual(["reserve", "start"]);

    const blocked = provider();
    const err = await run(blocked, {
      reserve: () => {
        throw new BudgetExceededError("Daily model budget reached.");
      },
    }).promise.catch((e) => e);
    expect(blocked.start).not.toHaveBeenCalled();
    expect(err.detail.code).toBe("budget");
    expect(blocked.remove).not.toHaveBeenCalled();
  });

  it("cancels while polling, asks the provider to delete the job, and downloads nothing", async () => {
    const ac = new AbortController();
    const p = provider({ poll: [{ id: "job1", status: "in_progress" }] });
    const c = clock();
    const sleep = vi.fn(async (ms: number, signal?: AbortSignal) => {
      c.slept.push(ms);
      ac.abort();
      if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
    });
    const err = await run(p, { signal: ac.signal, sleep }).promise.catch((e) => e);
    expect(err.detail.cancelled).toBe(true);
    expect(p.remove).toHaveBeenCalledWith("job1");
    expect(p.download).not.toHaveBeenCalled();
  });

  it("does not even reserve spend when it was cancelled before starting", async () => {
    const ac = new AbortController();
    ac.abort();
    const reserve = vi.fn();
    const err = await run(provider(), { signal: ac.signal, reserve }).promise.catch((e) => e);
    expect(err.detail.cancelled).toBe(true);
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("describeClipError", () => {
  const azure = { kind: "azure" as const, label: "Azure OpenAI", model: "dep" };
  it("explains credentials per provider", () => {
    expect(describeClipError(http(403), azure).message).toMatch(/Cognitive Services OpenAI User/);
    expect(describeClipError(http(401), { ...azure, kind: "gemini", label: "Google Gemini" }).message).toMatch(/GEMINI_API_KEY.*paid tier/);
  });

  it("names the missing model and mentions that Sora 2 is retired on a 404", () => {
    const m = describeClipError(http(404), azure).message;
    expect(m).toMatch(/could not find the video model "dep"/);
    expect(m).toMatch(/Sora 2 is retired/);
  });

  it("separates unreachable from dropped and truncates unknown errors", () => {
    const refused = new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    expect(describeClipError(refused, azure).message).toMatch(/Could not reach Azure OpenAI/);
    expect(describeClipError(new Error("x".repeat(900)), azure).message).toHaveLength(400);
  });
});

describe("clipLimits", () => {
  it("reads operator limits with safe bounds", () => {
    expect(clipLimits({})).toMatchObject({ pollMs: 5000, timeoutMs: 20 * 60_000, maxBytes: 200 * 1024 * 1024, concurrency: 2 });
    expect(clipLimits({ VIDEO_CLIP_POLL_SECONDS: "2", VIDEO_CLIP_MAX_MB: "50", VIDEO_CLIP_CONCURRENCY: "99" })).toMatchObject({
      pollMs: 2000,
      maxBytes: 50 * 1024 * 1024,
      concurrency: 4,
    });
    expect(clipLimits({ VIDEO_CLIP_POLL_SECONDS: "nope", VIDEO_CLIP_CONCURRENCY: "0" }).concurrency).toBe(2);
  });
});
