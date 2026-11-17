import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEARN_PAGE_SIZE, canonicalLearnUrl, discoverLearn, expansionQueries, learnResultCap, mergeRanked, type LearnHit,
} from "@/lib/learndiscover";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safefetch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/safefetch")>(),
  safeFetch: mocks.safeFetch,
}));

const base = "https://learn.microsoft.com/microsoft-copilot-studio/";
const page = (n: number) => `${base}page-${n}`;
const apiItem = (n: number, category = "Documentation") => ({
  title: `Page ${n}`, url: page(n).replace(".com/", ".com/en-us/"), description: `About page ${n}`, category,
});

/** Learn site search: page `skip / top` of an endless catalog of pages. */
function apiReply(url: URL) {
  const top = Number(url.searchParams.get("$top"));
  const skip = Number(url.searchParams.get("$skip"));
  return { results: Array.from({ length: top }, (_, i) => apiItem(skip + i + 1)) };
}

const mcpReply = (pages: number[]) => ({
  jsonrpc: "2.0", id: 1,
  result: { content: [{ type: "text", text: JSON.stringify({
    results: pages.flatMap((n) => [
      { title: `MCP page ${n}`, contentUrl: page(n), content: `Passage one of ${n}` },
      { title: `MCP page ${n}`, contentUrl: page(n) + "#second", content: `Passage two of ${n}` },
    ]),
  }) }] },
});

let mcpQueries: string[];
let apiCalls: URL[];
let apiFails = false;
let mcpFails: (query: string) => boolean;

beforeEach(() => {
  mcpQueries = [];
  apiCalls = [];
  apiFails = false;
  mcpFails = () => false;
  mocks.safeFetch.mockImplementation(async (target: string, init: RequestInit) => {
    const url = new URL(target);
    if (url.pathname === "/api/search") {
      apiCalls.push(url);
      if (apiFails) throw new Error("search offline");
      return { res: new Response(JSON.stringify(apiReply(url))), finalUrl: target };
    }
    const query = JSON.parse(String(init.body)).params.arguments.query as string;
    mcpQueries.push(query);
    if (mcpFails(query)) return { res: new Response("{}", { status: 503 }), finalUrl: target };
    // Each angle surfaces a few pages, some overlapping the site search.
    const offset = (mcpQueries.length % 5) * 3;
    return { res: new Response(JSON.stringify(mcpReply([1, 2, 100 + offset, 101 + offset]))), finalUrl: target };
  });
});
afterEach(() => {
  vi.resetAllMocks();
  delete process.env.LEARN_MAX_RESULTS;
});

describe("canonicalLearnUrl", () => {
  it("treats locale, fragment, query, case and trailing slash variants as one page", () => {
    const key = canonicalLearnUrl("https://learn.microsoft.com/microsoft-copilot-studio/overview");
    for (const variant of [
      "https://learn.microsoft.com/en-us/microsoft-copilot-studio/overview",
      "https://learn.microsoft.com/de-DE/microsoft-copilot-studio/overview/",
      "https://learn.microsoft.com/en-us/microsoft-copilot-studio/overview?view=x#intro",
      "https://learn.microsoft.com/en-us/Microsoft-Copilot-Studio/Overview",
    ]) expect(canonicalLearnUrl(variant)).toBe(key);
    expect(canonicalLearnUrl("https://learn.microsoft.com/microsoft-copilot-studio/agents")).not.toBe(key);
  });
});

describe("learnResultCap", () => {
  it.each([[undefined, 100], ["40", 40], ["5", 10], ["9000", 300], ["junk", 100], ["0", 100]])(
    "reads LEARN_MAX_RESULTS=%s as %s", (value, expected) => {
      if (value === undefined) delete process.env.LEARN_MAX_RESULTS;
      else process.env.LEARN_MAX_RESULTS = value;
      expect(learnResultCap()).toBe(expected);
    },
  );
});

describe("expansionQueries", () => {
  it("expands broad topics only", () => {
    expect(expansionQueries("Copilot Studio")).toEqual(expect.arrayContaining(["Copilot Studio overview", "Copilot Studio tutorial"]));
    expect(expansionQueries("  Azure ")).toHaveLength(5);
    expect(expansionQueries("configure managed identity for container registry pull")).toEqual([]);
  });
});

describe("mergeRanked", () => {
  const hit = (n: number, snippet = ""): LearnHit => ({
    title: `P${n}`, url: page(n), snippet, host: "learn.microsoft.com", provider: "microsoft-learn", kind: "Documentation",
  });

  it("ranks pages that several searches agree on above a lone first place", () => {
    const merged = mergeRanked([[hit(1), hit(2), hit(3)], [hit(9), hit(3)]]);
    expect(merged.map((h) => h.url)).toEqual([page(3), page(1), page(9), page(2)]);
  });

  it("keeps one entry per canonical page and fills a missing snippet", () => {
    const merged = mergeRanked([[hit(1)], [{ ...hit(1, "Excerpt"), url: page(1) + "#x" }, hit(1, "again")]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].snippet).toBe("Excerpt");
  });
});

describe("discoverLearn", () => {
  it("returns dozens of distinct pages for a broad query, from several searches", async () => {
    const found = await discoverLearn("Copilot Studio");
    const urls = found.results.map((h) => h.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBeGreaterThan(30);
    // Site-search URLs lose their locale so they match saved sources and MCP results.
    expect(urls.every((u) => !/\/[a-z]{2}-[a-z]{2}\//.test(u))).toBe(true);
    expect(mcpQueries).toEqual(expect.arrayContaining(["Copilot Studio", "Copilot Studio overview", "Copilot Studio how to"]));
    expect(mcpQueries).toHaveLength(6);
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].searchParams.get("$top")).toBe(String(LEARN_PAGE_SIZE));
    expect(found.nextOffset).toBe(LEARN_PAGE_SIZE);
    expect(found.warnings).toEqual([]);
    // Pages found by both the site search and MCP are listed once, ahead of single-source pages.
    expect(urls.indexOf(page(1))).toBeLessThan(urls.indexOf(page(25)));
  });

  it("keeps narrow queries to one site search and one passage search", async () => {
    const found = await discoverLearn("configure managed identity for container registry pull");
    expect(mcpQueries).toHaveLength(1);
    expect(apiCalls).toHaveLength(1);
    expect(found.queries).toHaveLength(1);
  });

  it("pages through the site search without repeating the passage searches", async () => {
    const second = await discoverLearn("Copilot Studio", 30);
    expect(mcpQueries).toEqual([]);
    expect(apiCalls[0].searchParams.get("$skip")).toBe("30");
    expect(second.results.map((h) => h.url)).toEqual(Array.from({ length: 30 }, (_, i) => page(31 + i)));
    expect(second.nextOffset).toBe(60);
  });

  it("stops at the configured cap with a short final page", async () => {
    process.env.LEARN_MAX_RESULTS = "40";
    expect((await discoverLearn("Copilot Studio", 0)).nextOffset).toBe(30);
    const last = await discoverLearn("Copilot Studio", 30);
    expect(apiCalls[1].searchParams.get("$top")).toBe("10");
    expect(last.results).toHaveLength(10);
    expect(last.nextOffset).toBeNull();
    expect((await discoverLearn("Copilot Studio", 40)).results).toEqual([]);
  });

  it("ends paging when the site search runs dry", async () => {
    mocks.safeFetch.mockImplementation(async (target: string) => ({
      res: new Response(JSON.stringify({ results: [apiItem(1), apiItem(2)] })), finalUrl: target,
    }));
    expect((await discoverLearn("narrow topic words are long enough here", 30)).nextOffset).toBeNull();
  });

  it("drops non-documentation URLs and maps content types", async () => {
    mocks.safeFetch.mockImplementation(async (target: string) => ({
      res: new Response(JSON.stringify({ results: [
        apiItem(1), apiItem(2, "Training"), apiItem(3, "Show"), apiItem(4, "Credential"),
        { title: "Q&A", url: "https://learn.microsoft.com/en-us/answers/questions/1", category: "Q&A" },
        { title: "Elsewhere", url: "https://example.com/x", category: "Documentation" },
        { title: "Insecure", url: "http://learn.microsoft.com/azure/x", category: "Documentation" },
      ] })), finalUrl: target,
    }));
    const found = await discoverLearn("a narrow topic with many words inside", 30);
    expect(found.results.map((h) => h.kind)).toEqual(["Documentation", "Training", "Videos", "Certifications"]);
  });

  it("keeps partial results and says which searches failed", async () => {
    mcpFails = (query) => query.endsWith("tutorial") || query.endsWith("concepts");
    const found = await discoverLearn("Copilot Studio");
    expect(found.results.length).toBeGreaterThan(30);
    expect(found.warnings).toEqual(["2 of 6 complementary searches failed."]);
  });

  it("falls back to passage search when the site search is down", async () => {
    apiFails = true;
    const found = await discoverLearn("Copilot Studio");
    expect(found.results.length).toBeGreaterThan(2);
    expect(found.nextOffset).toBeNull();
    expect(found.warnings.join(" ")).toMatch(/site search is unavailable/);
  });

  it("fails clearly when nothing can be searched, and when a later page cannot load", async () => {
    apiFails = true;
    mcpFails = () => true;
    await expect(discoverLearn("Copilot Studio")).rejects.toThrow(/Microsoft Learn/);
    await expect(discoverLearn("Copilot Studio", 30)).rejects.toThrow(/Microsoft Learn/);
  });

  it.each(["", "   ", "x".repeat(1001)])("rejects an invalid topic before searching", async (topic) => {
    await expect(discoverLearn(topic)).rejects.toThrow(/topic|1,000/);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("only talks to the Learn search endpoint", async () => {
    await discoverLearn("Copilot Studio");
    for (const [target] of mocks.safeFetch.mock.calls) {
      expect(["https://learn.microsoft.com/api/search", "https://learn.microsoft.com/api/mcp"]).toContain(new URL(target).origin + new URL(target).pathname);
    }
  });
});
