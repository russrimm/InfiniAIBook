import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeProvider, searchWeb, SearchUnavailableError } from "@/lib/websearch";
import { POST } from "@/app/api/discover/route";

const rss = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>Bing: research</title><link>https://www.bing.com/search?q=research</link>
  <item>
    <title>Research &amp; evidence</title>
    <link>https://example.org/research?a=1&amp;b=2</link>
    <description><![CDATA[An <b>authoritative</b> overview.]]></description>
  </item>
  <item><title>Social post</title><link>https://facebook.com/post</link></item>
  <item><title>Invalid link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

function providers(bing: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === "HEAD") return new Response(null, { status: 200 });
    if (url.hostname === "www.bing.com" && url.searchParams.get("format") === "rss") {
      return bing();
    }
    if (url.hostname === "api.tavily.com") {
      return Response.json({ results: [{ title: "API result", url: "https://example.org/api", content: "API snippet" }] });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  for (const name of ["TAVILY_API_KEY", "BRAVE_SEARCH_API_KEY", "GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_CX", "YOUTUBE_API_KEY"]) {
    vi.stubEnv(name, "");
  }
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("source discovery providers", () => {
  it("searches Bing directly without contacting another provider", async () => {
    const fetchMock = providers(
      () => new Response(rss, { headers: { "content-type": "text/xml" } }),
    );
    expect(await searchWeb(["research"])).toEqual([{
      title: "Research & evidence",
      url: "https://example.org/research?a=1&b=2",
      snippet: "An authoritative overview.",
      host: "example.org",
      provider: "bing",
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://www.bing.com/search?format=rss&q=research");
    expect(activeProvider()).toBe("bing");
  });

  it("falls back after an HTTP error or a network failure", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    for (const bing of [
      () => new Response("Too many requests", { status: 429 }),
      () => { throw new TypeError("fetch failed"); },
    ]) {
      providers(bing);
      expect(await searchWeb(["research"])).toMatchObject([{
        title: "API result", url: "https://example.org/api", provider: "tavily",
      }]);
    }
  });

  it("keeps Bing primary even when an API provider is configured", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    const fetchMock = providers(() => new Response(rss));
    expect(await searchWeb(["research"])).toMatchObject([{
      title: "Research & evidence", provider: "bing",
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(activeProvider()).toBe("bing");
  });

  it("uses a configured API fallback when Bing has no usable results", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    providers(() => new Response("<rss><channel></channel></rss>"));
    expect(await searchWeb(["research"])).toMatchObject([{
      title: "API result", url: "https://example.org/api", provider: "tavily",
    }]);
  });

  it("honors the result limit and merges duplicate URLs across queries", async () => {
    providers(
      () => new Response(rss.replace("</channel>", '<item><title>Second page</title><link>https://example.org/second</link></item></channel>')),
    );
    expect(await searchWeb(["research", "evidence"], 1)).toMatchObject([{
      url: "https://example.org/research?a=1&b=2",
    }]);
  });

  it("does not turn a complete provider outage into empty results", async () => {
    providers(
      () => new Response("Service unavailable", { status: 503 }),
    );
    await expect(searchWeb(["research"])).rejects.toBeInstanceOf(SearchUnavailableError);
    await expect(searchWeb(["research"])).rejects.toThrow(/TAVILY_API_KEY/);
  });

  it("returns an empty list when a working provider genuinely has no results", async () => {
    providers(
      () => new Response("<rss><channel></channel></rss>"),
    );
    expect(await searchWeb(["nonexistent topic"])).toEqual([]);
  });

  it("treats a non-RSS search response as a provider failure", async () => {
    providers(
      () => new Response("<html>Service unavailable</html>"),
    );
    await expect(searchWeb(["research"])).rejects.toBeInstanceOf(SearchUnavailableError);
  });

  it("keeps successful queries when another query fails", async () => {
    let attempts = 0;
    providers(
      () => ++attempts === 1 ? new Response("Unavailable", { status: 503 }) : new Response(rss),
    );
    expect(await searchWeb(["first angle", "second angle"])).toHaveLength(1);
  });
});

describe("source discovery API", () => {
  const submit = () => POST(new Request("http://localhost/api/discover", {
    method: "POST",
    body: JSON.stringify({ topic: "research", expand: false }),
  }));

  it("reports the provider that actually returned results", async () => {
    providers(
      () => new Response(rss),
    );
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "bing", results: [{ provider: "bing" }] });
  });

  it("reports the API provider when Bing fails and a configured fallback succeeds", async () => {
    vi.stubEnv("TAVILY_API_KEY", "test-key");
    providers(() => new Response("Unavailable", { status: 503 }));
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: "tavily", results: [{ provider: "tavily" }] });
  });

  it("returns actionable provider failure details with a 502 status", async () => {
    providers(
      () => new Response("Unavailable", { status: 503 }),
    );
    const response = await submit();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "search_unavailable", error: expect.stringMatching(/TAVILY_API_KEY/),
    });
  });

  it("allows the UI to show its normal empty-results state", async () => {
    providers(
      () => new Response("<rss><channel></channel></rss>"),
    );
    const response = await submit();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: [] });
  });
});
