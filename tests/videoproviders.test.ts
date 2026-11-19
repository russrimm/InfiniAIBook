import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiProvider } from "@/lib/videogemini";
import { createOpenAIVideoProvider, type OpenAIVideoConfig } from "@/lib/videoopenai";
import { DownloadTooLargeError, httpError, looksLikeMp4, safeRemoteId, streamToFile, writeVideoFile } from "@/lib/videohttp";
import type { ClipRequest } from "@/lib/videoclip";
import { MP4 } from "./videofixtures";

const req: ClipRequest = { prompts: ["x"], aspect: "9:16", duration: 8, resolution: "720p", variants: 1 };
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "clip-prov-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("Gemini provider", () => {
  const cfg = { model: "gemini-omni-1.2-flash", apiKey: "secret-key", baseUrl: "https://gen.example/" };

  it("posts the Interactions request with the key in a header, not the URL", async () => {
    const fetchMock = vi.fn(async () => json({ id: "v1_a", status: "completed", steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: MP4.toString("base64") }] }] }));
    const p = createGeminiProvider(cfg, { fetch: fetchMock as unknown as typeof fetch });
    const job = await p.start(req, "a calm harbor", {});

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gen.example/v1beta/interactions");
    expect(url).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gemini-omni-1.2-flash",
      input: "a calm harbor",
      response_format: { type: "video", aspect_ratio: "9:16", resolution: "720p", duration: "8s" },
    });
    expect(job.status).toBe("completed");
    expect(job.inline && Buffer.from(job.inline).equals(MP4)).toBe(true);

    const dest = path.join(dir, "out.mp4");
    expect(await p.download(job, dest, 1_000_000)).toBe(MP4.length);
    expect(fs.readFileSync(dest).equals(MP4)).toBe(true);
  });

  it("sends a reference image before the text", async () => {
    const fetchMock = vi.fn(async () => json({ id: "v1_b", status: "in_progress" }));
    const p = createGeminiProvider(cfg, { fetch: fetchMock as unknown as typeof fetch });
    const job = await p.start({ ...req, reference: { mime: "image/png", data: "QUJD" } }, "animate it", {});
    expect(job.status).toBe("in_progress");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.input).toEqual([
      { type: "image", data: "QUJD", mime_type: "image/png" },
      { type: "text", text: "animate it" },
    ]);
  });

  it("polls a running interaction by id and deletes it on request", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? new Response(null, { status: 204 }) : json({ id: "v1_c", status: "completed", steps: [{ type: "model_output", content: [{ type: "video", data: MP4.toString("base64") }] }] }),
    );
    const p = createGeminiProvider(cfg, { fetch: fetchMock as unknown as typeof fetch });
    expect((await p.poll("v1_c", {})).status).toBe("completed");
    expect(fetchMock.mock.calls[0][0]).toBe("https://gen.example/v1beta/interactions/v1_c");
    await p.remove!("v1_c", {});
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("maps a reply with words and no video to a content refusal, and an error object to a failure", async () => {
    const refusal = vi.fn(async () => json({ id: "v1_d", status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: "I can't create videos of real people." }] }] }));
    const job = await createGeminiProvider(cfg, { fetch: refusal as unknown as typeof fetch }).start(req, "p", {});
    expect(job.status).toBe("failed");
    expect(job.error?.moderation).toBe(true);
    expect(job.error?.message).toMatch(/real people/);

    const failing = vi.fn(async () => json({ id: "v1_e", status: "failed", error: { code: "SAFETY", message: "blocked by safety filters" } }));
    const j2 = await createGeminiProvider(cfg, { fetch: failing as unknown as typeof fetch }).start(req, "p", {});
    expect(j2).toMatchObject({ status: "failed", error: { code: "SAFETY", moderation: true } });
  });

  it("turns a 429 into an error the retry layer can read, with Retry-After", async () => {
    const fetchMock = vi.fn(async () => json({ error: { code: 429, message: "Resource exhausted" } }, { status: 429, headers: { "retry-after": "7" } }));
    const p = createGeminiProvider(cfg, { fetch: fetchMock as unknown as typeof fetch });
    await expect(p.start(req, "p", {})).rejects.toMatchObject({ status: 429, headers: { "retry-after": "7" } });
  });

  it("will not save something that is not an MP4", async () => {
    const p = createGeminiProvider(cfg, { fetch: vi.fn() as unknown as typeof fetch });
    await expect(p.download({ id: "x", status: "completed", inline: Buffer.from("<html>") }, path.join(dir, "bad.mp4"), 1000)).rejects.toThrow(/not an MP4/);
    expect(fs.existsSync(path.join(dir, "bad.mp4"))).toBe(false);
  });
});

describe("OpenAI-compatible Videos API provider", () => {
  const base = (over: Partial<OpenAIVideoConfig> = {}): OpenAIVideoConfig => ({
    kind: "azure",
    label: "Azure",
    model: "my-deployment",
    baseUrl: "https://res.openai.azure.com/openai/v1/",
    authHeaders: async (a) => (a === 0 ? { Authorization: "Bearer one" } : { Authorization: "Bearer two" }),
    aspects: ["16:9", "9:16"],
    durations: [4, 8],
    resolutions: [{ id: "720p", label: "720p" }],
    defaultResolution: "720p",
    prices: { "720p": 0.1 },
    priceNote: "test",
    ...over,
  });

  it("creates a job with a multipart body naming the deployment, size and seconds", async () => {
    const fetchMock = vi.fn(async () => json({ id: "video_1", status: "queued", progress: 0 }));
    const p = createOpenAIVideoProvider(base(), { fetch: fetchMock as unknown as typeof fetch });
    const job = await p.start({ ...req, reference: { mime: "image/jpeg", data: Buffer.from("jpg").toString("base64") } }, "a prompt", {});

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://res.openai.azure.com/openai/v1/videos");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer one");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("my-deployment");
    expect(form.get("prompt")).toBe("a prompt");
    expect(form.get("size")).toBe("720x1280");
    expect(form.get("seconds")).toBe("8");
    expect((form.get("input_reference") as File).name).toBe("reference.jpeg");
    expect(job).toEqual({ id: "video_1", status: "queued", progress: 0 });
  });

  it("adds an api-version query when configured", async () => {
    const fetchMock = vi.fn(async () => json({ id: "video_2", status: "queued" }));
    const p = createOpenAIVideoProvider(base({ query: "api-version=preview" }), { fetch: fetchMock as unknown as typeof fetch });
    await p.poll("video_2", {});
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://res.openai.azure.com/openai/v1/videos/video_2?api-version=preview");
  });

  it("maps statuses, progress and a failure with a moderation code", async () => {
    const replies = [
      json({ id: "v", status: "in_progress", progress: 41 }),
      json({ id: "v", status: "completed", progress: 100 }),
      json({ id: "v", status: "failed", error: { code: "moderation_blocked", message: "Your request was rejected by the safety system." } }),
    ];
    const p = createOpenAIVideoProvider(base(), { fetch: (async () => replies.shift()!) as unknown as typeof fetch });
    expect(await p.poll("v", {})).toEqual({ id: "v", status: "in_progress", progress: 41 });
    expect((await p.poll("v", {})).status).toBe("completed");
    const failed = await p.poll("v", {});
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({ code: "moderation_blocked", moderation: true });
  });

  it("falls back to the second token audience once after a 401", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>).Authorization;
      seen.push(auth);
      return auth === "Bearer one" ? new Response("no", { status: 401 }) : json({ id: "v", status: "queued" });
    });
    const p = createOpenAIVideoProvider(base(), { fetch: fetchMock as unknown as typeof fetch });
    expect((await p.poll("v", {})).status).toBe("queued");
    expect(seen).toEqual(["Bearer one", "Bearer two"]);
  });

  it("does not retry a 401 forever when there is no other credential", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
    const p = createOpenAIVideoProvider(base({ authHeaders: async (a) => (a === 0 ? { "api-key": "k" } : null) }), { fetch: fetchMock as unknown as typeof fetch });
    await expect(p.poll("v", {})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("streams the clip to disk, fetches the poster, and deletes the remote job", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.includes("variant=thumbnail")) return new Response(Buffer.from("jpeg-bytes"), { status: 200 });
      return new Response(MP4, { status: 200, headers: { "content-type": "video/mp4" } });
    });
    const p = createOpenAIVideoProvider(base(), { fetch: fetchMock as unknown as typeof fetch });
    const dest = path.join(dir, "c.mp4");
    expect(await p.download({ id: "video_9", status: "completed" }, dest, 1_000_000)).toBe(MP4.length);
    expect(fetchMock.mock.calls[0][0]).toBe("https://res.openai.azure.com/openai/v1/videos/video_9/content?variant=video");
    expect(fs.readFileSync(dest).equals(MP4)).toBe(true);

    expect(await p.poster!({ id: "video_9", status: "completed" }, path.join(dir, "c.jpg"), 1_000_000)).toBe(true);
    await p.remove!("video_9", {});
    expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("reports no poster, not an error, when the thumbnail is missing", async () => {
    const p = createOpenAIVideoProvider(base(), { fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch });
    expect(await p.poster!({ id: "video_9", status: "completed" }, path.join(dir, "c.jpg"), 1000)).toBe(false);
  });

  it("refuses a job id that could change the request path", async () => {
    const p = createOpenAIVideoProvider(base(), { fetch: vi.fn() as unknown as typeof fetch });
    await expect(p.poll("../secrets", {})).rejects.toThrow(/unusable job id/);
    await expect(createOpenAIVideoProvider(base(), { fetch: (async () => json({ id: "a/b", status: "queued" })) as unknown as typeof fetch }).start(req, "p", {})).rejects.toThrow(/unusable job id/);
  });

  it("does not follow a redirect from the provider into a private network", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    const p = createOpenAIVideoProvider(base(), { fetch: fetchMock as unknown as typeof fetch });
    await expect(p.download({ id: "video_9", status: "completed" }, path.join(dir, "r.mp4"), 1000)).rejects.toThrow(/private or local|cannot be fetched|resolved/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(dir, "r.mp4"))).toBe(false);
  });
});

describe("download helpers", () => {
  it("refuses a clip over the cap, by declared size and by streamed size, leaving no file", async () => {
    const dest = path.join(dir, "big.mp4");
    const declared = new Response(MP4, { headers: { "content-length": "999999" } });
    await expect(streamToFile(declared, dest, 100)).rejects.toBeInstanceOf(DownloadTooLargeError);
    await expect(streamToFile(new Response(MP4), dest, 20)).rejects.toThrow(/larger than the/);
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    expect(() => writeVideoFile(dest, MP4, 10)).toThrow(DownloadTooLargeError);
  });

  it("rejects a body that is not an MP4 and an aborted download", async () => {
    await expect(streamToFile(new Response("<html>not video</html>"), path.join(dir, "n.mp4"), 1000)).rejects.toThrow(/not an MP4/);
    const ac = new AbortController();
    ac.abort();
    await expect(streamToFile(new Response(MP4), path.join(dir, "a.mp4"), 1000, { signal: ac.signal })).rejects.toBeTruthy();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("recognizes MP4 and builds HTTP errors that carry status, headers and moderation", async () => {
    expect(looksLikeMp4(MP4)).toBe(true);
    expect(looksLikeMp4(Buffer.from("not an mp4 at all"))).toBe(false);
    const e = await httpError(
      new Response(JSON.stringify({ error: { code: "content_policy_violation", message: "That prompt is not allowed." } }), { status: 400, headers: { "retry-after-ms": "1500" } }),
      "The video request",
    );
    expect(e.status).toBe(400);
    expect(e.headers["retry-after"]).toBe("1.5");
    expect(e.failure).toMatchObject({ code: "content_policy_violation", moderation: true });
    expect(e.message).toMatch(/That prompt is not allowed/);
    expect(safeRemoteId("video_abc-123")).toBe("video_abc-123");
    expect(() => safeRemoteId("a b")).toThrow();
  });
});
