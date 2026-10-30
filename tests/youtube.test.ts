import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchYouTubeTranscript, YouTubeBlockedError } from "@/lib/youtube";

const videoId = "abcdefghijk";
const url = `https://www.youtube.com/watch?v=${videoId}`;
const title = "Deep Dive into LLMs like ChatGPT";

function mockYouTube(options: { description?: string; geminiError?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const requestUrl = String(input);
    if (requestUrl.includes("generativelanguage.googleapis.com")) {
      if (options.geminiError) throw new Error("Connection interrupted");
      return Response.json({
        candidates: [{ content: { parts: [{ text: "The spoken words from the video." }] } }],
      });
    }
    if (requestUrl.includes("/videos?")) {
      return Response.json({
        items: [{
          snippet: { title, channelTitle: "Author", description: options.description ?? "" },
          contentDetails: { duration: "PT10M", caption: "true" },
        }],
      });
    }
    if (requestUrl.includes("/oembed?")) {
      return Response.json({ title, author_name: "Author" });
    }
    if (requestUrl.includes("/watch?")) {
      return new Response(JSON.stringify({
        captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=abcdefghijk", languageCode: "en" }],
      }));
    }
    if (requestUrl.includes("/api/timedtext?")) return new Response("");
    if (requestUrl.includes("/captions?")) {
      return Response.json({ items: [{ snippet: { language: "en", trackKind: "asr" } }] });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configureEnv() {
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("YOUTUBE_API_KEY", "");
  vi.stubEnv("YOUTUBE_COOKIE", "");
}

describe("YouTube source recovery", () => {
  it("recommends Gemini rather than a session cookie when captions are blocked", async () => {
    configureEnv();
    const fetchMock = mockYouTube();
    const result = fetchYouTubeTranscript(url);
    await expect(result).rejects.toBeInstanceOf(YouTubeBlockedError);
    await expect(result).rejects.toThrow(/Set GEMINI_API_KEY on the app server/);
    await expect(result).rejects.toThrow(/restart or redeploy/);
    await expect(result).rejects.toThrow(/use "Paste"/);
    await expect(result).rejects.not.toThrow(/Set YOUTUBE_COOKIE/);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.anything()
    );
  });

  it("does not claim a cookie was rejected just because captions were empty", async () => {
    configureEnv();
    vi.stubEnv("YOUTUBE_COOKIE", "test-cookie");
    mockYouTube();
    await expect(fetchYouTubeTranscript(url)).rejects.toThrow(
      "YOUTUBE_COOKIE is set, but public captions still could not be retrieved."
    );
  });

  it("imports a Gemini transcript without requesting public captions", async () => {
    configureEnv();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = mockYouTube();
    const result = await fetchYouTubeTranscript(url);
    expect(result).toMatchObject({ title, kind: "youtube" });
    expect(result.text).toContain("The spoken words from the video.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("labels description-only fallback and includes the recovery guidance", async () => {
    configureEnv();
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    mockYouTube({ description: "A detailed description of the video's contents. ".repeat(8) });
    const result = await fetchYouTubeTranscript(url);
    expect(result.kind).toBe("youtube-description");
    expect(result.title).toBe(`${title} (description only)`);
    expect(result.warning).toContain("Set GEMINI_API_KEY");
    expect(result.text).toContain("description, not its transcript");
  });

  it("preserves Gemini failures instead of suggesting missing Gemini configuration", async () => {
    configureEnv();
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    mockYouTube({ geminiError: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(fetchYouTubeTranscript(url)).rejects.toThrow(
        "Gemini could not transcribe it: Could not reach the Gemini API"
      );
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
