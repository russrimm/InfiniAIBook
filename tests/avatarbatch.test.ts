import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  avatarPollDelayMs,
  deleteAvatarJob,
  getAvatarJob,
  submitAvatarJob,
} from "@/lib/avatarbatch";

const fetchMock = vi.fn();
const ENV = [
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_ENDPOINT",
  "AZURE_SPEECH_MAX_RETRIES",
  "AZURE_SPEECH_RETRY_BUDGET_SECONDS",
  "AZURE_AVATAR_SUBMIT_SPACING_MS",
] as const;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const job = (status: string, id = "job-1") => json(200, { id, status });
const rateLimited = (seconds = 7) =>
  json(
    429,
    {
      error: {
        code: "429",
        message: `Requests to the Create avatar batch synthesis Operation under Batch Avatar API version 2024-08-01 have exceeded call rate limit of your current SpeechServices S0 pricing tier. Please retry after ${seconds} seconds.`,
      },
    },
    { "Retry-After": String(seconds) },
  );

const OPTS = { character: "lisa", style: "casual-sitting", background: "#112233" };
const submit = (call = {}) => submitAvatarJob("job-1", "<speak>Hello there</speak>", OPTS, call);
const calls = () => fetchMock.mock.calls.map(([u, init]) => `${init?.method ?? "GET"} ${String(u)}`);

// Reading a response body takes a real turn of the event loop, so move the fake clock in steps that let it happen.
async function advance(ms: number) {
  for (let t = 0; t < ms; t += 500) {
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(Math.min(500, ms - t));
  }
}

let epoch = Date.now();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  // The rate gates outlive a test, so each starts well after the last one's waits.
  epoch += 3_600_000;
  vi.setSystemTime(epoch);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.stubEnv("AZURE_SPEECH_KEY", "test-key");
  vi.stubEnv("AZURE_SPEECH_ENDPOINT", "https://speech.example.test");
  vi.stubEnv("AZURE_AVATAR_SUBMIT_SPACING_MS", "0");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const k of ENV) delete process.env[k];
});

describe("creating an avatar job", () => {
  it("waits out a 429 and retries the same id, reporting the wait", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited(7)).mockResolvedValueOnce(job("NotStarted"));
    const onWait = vi.fn();
    const pending = submit({ onWait });
    await advance(6_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(3_000);
    await expect(pending).resolves.toMatchObject({ status: "NotStarted" });
    expect(calls()).toEqual([
      "PUT https://speech.example.test/avatar/batchsyntheses/job-1?api-version=2024-08-01",
      "PUT https://speech.example.test/avatar/batchsyntheses/job-1?api-version=2024-08-01",
    ]);
    expect(onWait).toHaveBeenCalledExactlyOnceWith(
      "Azure Speech is rate limiting requests; retrying in 8 s (attempt 2 of 7).",
    );
  });

  it("adopts the job when a retry finds it already exists (409)", async () => {
    // The first reply was lost after Azure accepted the job; the retry says so.
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(409, { error: { message: "already exists" } }))
      .mockResolvedValueOnce(job("Running"));
    const pending = submit();
    await advance(5_000);
    await expect(pending).resolves.toMatchObject({ id: "job-1", status: "Running" });
    expect(calls().map((c) => c.split(" ")[0])).toEqual(["PUT", "PUT", "GET"]);
  });

  it("gives an actionable message once the retry budget is spent", async () => {
    vi.stubEnv("AZURE_SPEECH_MAX_RETRIES", "2");
    fetchMock.mockImplementation(async () => rateLimited(3));
    const pending = submit();
    const settled = expect(pending).rejects.toMatchObject({ status: 429 });
    await advance(30_000);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const error = await pending.catch((e: Error) => e);
    expect((error as Error).message).toMatch(/rate limiting avatar requests.*after 3 attempts/);
    expect((error as Error).message).toMatch(/Nothing was billed/);
    expect((error as Error).message).toMatch(/press Render again/);
    expect((error as Error).message).toMatch(/Azure support/);
  });

  it("does not wait when the service asks for longer than the budget", async () => {
    vi.stubEnv("AZURE_SPEECH_RETRY_BUDGET_SECONDS", "30");
    fetchMock.mockResolvedValueOnce(rateLimited(600));
    await expect(submit()).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient 503", async () => {
    fetchMock.mockResolvedValueOnce(json(503, {})).mockResolvedValueOnce(job("NotStarted"));
    const pending = submit();
    await advance(5_000);
    await expect(pending).resolves.toMatchObject({ status: "NotStarted" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops waiting when the render is cancelled", async () => {
    fetchMock.mockResolvedValue(rateLimited(60));
    const controller = new AbortController();
    const pending = submit({ signal: controller.signal });
    const settled = expect(pending).rejects.toThrow(/cancel/);
    await advance(10_000);
    controller.abort(new Error("cancelled"));
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, /could not start the avatar render \(400\)/],
    [401, /refused to start the avatar render \(401\).*Cognitive Services Speech User/],
    [403, /refused to start the avatar render \(403\).*Cognitive Services Speech User/],
    [404, /could not start the avatar render \(404\).*custom domain/],
  ])("does not retry a %i and keeps its message", async (status, message) => {
    fetchMock.mockResolvedValueOnce(json(status, { error: { message: "nope" } }));
    await expect(submit()).rejects.toMatchObject({ status, message: expect.stringMatching(message) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when Speech is not configured", async () => {
    delete process.env.AZURE_SPEECH_ENDPOINT;
    delete process.env.AZURE_SPEECH_KEY;
    await expect(submit()).rejects.toThrow(/need an Azure Speech resource/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("polling and cleaning up", () => {
  it("retries a 429 on a status check, and slows the next poll", async () => {
    fetchMock.mockResolvedValueOnce(rateLimited(9)).mockResolvedValueOnce(job("Running"));
    const pending = getAvatarJob("job-1");
    await advance(1_000);
    expect(avatarPollDelayMs(10_000)).toBe(10_000);
    expect(avatarPollDelayMs(1_000)).toBeGreaterThan(1_000);
    await advance(11_000);
    await expect(pending).resolves.toMatchObject({ status: "Running" });
  });

  it("gives up on a status check sooner than a create, leaving the poller to ask again", async () => {
    fetchMock.mockImplementation(async () => json(503, {}));
    const pending = getAvatarJob("job-1");
    const settled = expect(pending).rejects.toMatchObject({ status: 503 });
    await advance(60_000);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry a 404 status check", async () => {
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await expect(getAvatarJob("job-1")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never throws from a delete", async () => {
    fetchMock.mockImplementation(async () => rateLimited(2));
    const pending = deleteAvatarJob("job-1");
    await advance(60_000);
    await expect(pending).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json(404, {}));
    await expect(deleteAvatarJob("job-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
