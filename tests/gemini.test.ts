import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiError, hasGemini, transcribeYouTube } from "@/lib/gemini";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
const transcript = (text: string, extra: object = {}) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  ...extra,
});
const url = "https://www.youtube.com/watch?v=abc";

describe("hasGemini", () => {
  it("is true only for a non-blank key", () => {
    expect(hasGemini()).toBe(true);
    vi.stubEnv("GEMINI_API_KEY", "   ");
    expect(hasGemini()).toBe(false);
  });
});

describe("transcribeYouTube", () => {
  it("sends the video URL to the configured model and returns the transcript", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-custom");
    reply(200, transcript("  Hello world  ", { usageMetadata: { promptTokenCount: 42 } }));
    const result = await transcribeYouTube(url);
    expect(result).toEqual({ text: "Hello world", model: "gemini-custom", promptTokens: 42 });

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toContain("/models/gemini-custom:generateContent?key=test-key");
    const sent = JSON.parse(init.body);
    expect(sent.contents[0].parts[1].file_data.file_uri).toBe(url);
    expect(sent.generationConfig.temperature).toBe(0);
  });

  it("defaults the model and joins multiple parts", async () => {
    reply(200, { candidates: [{ content: { parts: [{ text: "one " }, { text: "two" }] } }] });
    const result = await transcribeYouTube(url);
    expect(result.model).toBe("gemini-2.5-flash");
    expect(result.text).toBe("one two");
    expect(result.promptTokens).toBe(0);
  });

  it("wraps network failures", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(transcribeYouTube(url)).rejects.toThrow(/Could not reach the Gemini API — socket hang up/);
  });

  it.each([
    [400, { error: { message: "API key not valid. Please pass a valid API key." } }, /GEMINI_API_KEY was rejected/],
    [403, { error: { message: "Forbidden here" } }, /Gemini refused the request: Forbidden here/],
    [429, { error: { message: "quota" } }, /rate limiting/],
    [500, { error: { message: "internal" } }, /Gemini returned 500: internal/],
  ])("explains a %i response", async (status, body, message) => {
    reply(status, body);
    const err = await transcribeYouTube(url).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err.message).toMatch(message);
  });

  it("falls back to the raw body when an error is not JSON", async () => {
    reply(502, "<html>bad gateway</html>");
    await expect(transcribeYouTube(url)).rejects.toThrow("Gemini returned 502: <html>bad gateway</html>");
  });

  it("reports a blocked prompt", async () => {
    reply(200, { promptFeedback: { blockReason: "SAFETY" } });
    await expect(transcribeYouTube(url)).rejects.toThrow("Gemini declined this video (SAFETY).");
  });

  it("reports an empty transcript with the finish reason", async () => {
    reply(200, { candidates: [{ finishReason: "OTHER", content: { parts: [] } }] });
    await expect(transcribeYouTube(url)).rejects.toThrow(/no transcript \(OTHER\)\. The video may be private/);
  });

  it("reports a video with no speech", async () => {
    reply(200, transcript("NO_SPEECH"));
    await expect(transcribeYouTube(url)).rejects.toThrow("no spoken audio");
  });

  it("does not mistake a transcript that merely starts with similar words for no speech", async () => {
    reply(200, transcript("NO_SPEECHES were given"));
    await expect(transcribeYouTube(url)).resolves.toMatchObject({ text: "NO_SPEECHES were given" });
  });
});
