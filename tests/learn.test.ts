import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLearnPage, normalizeLearnUrl, searchLearn } from "@/lib/learn";

const mocks = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock("@/lib/safefetch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/safefetch")>(),
  safeFetch: mocks.safeFetch,
}));

const url = "https://learn.microsoft.com/en-us/microsoft-copilot-studio/overview";
const rpc = (text: string) => ({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } });
const searchReply = () => rpc(JSON.stringify({ results: [
  { title: "Copilot overview", contentUrl: url, content: "# Copilot\nBuild an agent." },
  { title: "Foreign page", contentUrl: "https://example.com/doc", content: "Not Learn" },
  { title: "Insecure page", contentUrl: "http://learn.microsoft.com/azure/page", content: "Not HTTPS" },
] }));

function respond(body: unknown, sse = false, status = 200) {
  mocks.safeFetch.mockResolvedValue({
    res: new Response(sse ? `event: message\ndata: ${JSON.stringify(body)}\n\n` : JSON.stringify(body), { status }),
    finalUrl: "https://learn.microsoft.com/api/mcp",
  });
}

afterEach(() => vi.resetAllMocks());

describe("Microsoft Learn MCP", () => {
  it.each([false, true])("reads validated search passages (SSE=%s)", async (sse) => {
    respond(searchReply(), sse);
    expect(await searchLearn("Copilot Studio")).toEqual([{
      title: "Copilot overview", url, content: "# Copilot\nBuild an agent.",
    }]);
    expect(mocks.safeFetch).toHaveBeenCalledWith(
      "https://learn.microsoft.com/api/mcp",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
    const body = JSON.parse(mocks.safeFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ name: "microsoft_docs_search", arguments: { query: "Copilot Studio" } });
  });

  it("fetches the full page rather than importing a search snippet", async () => {
    respond(rpc("# Copilot Studio overview\n\nThe full documentation body."));
    expect(await fetchLearnPage(url + "#intro")).toEqual({
      title: "Copilot Studio overview", url, text: "# Copilot Studio overview\n\nThe full documentation body.",
    });
    expect(JSON.parse(mocks.safeFetch.mock.calls[0][1].body).params).toEqual({
      name: "microsoft_docs_fetch", arguments: { url },
    });
  });

  it("keeps a successful empty search distinct from failure", async () => {
    respond(rpc('{"results":[]}'));
    expect(await searchLearn("nonexistent topic")).toEqual([]);
  });

  it.each([
    { jsonrpc: "2.0", id: 1, error: { code: -32603, message: "Search unavailable" } },
    { result: { isError: true, content: [{ type: "text", text: "Tool is unavailable" }] } },
    { result: { content: [{ type: "text", text: "not JSON results" }] } },
    { result: { content: [{ type: "text", text: "{}" }] } },
  ])("reports malformed and error tool replies explicitly", async (body) => {
    respond(body);
    await expect(searchLearn("Copilot Studio")).rejects.toThrow(/Microsoft Learn/);
  });

  it("reports HTTP and network failures explicitly", async () => {
    respond({}, false, 429);
    await expect(searchLearn("Copilot Studio")).rejects.toThrow(/429/);
    mocks.safeFetch.mockRejectedValue(new Error("Connection failed"));
    await expect(searchLearn("Copilot Studio")).rejects.toThrow(/Microsoft Learn.*Connection failed/);
  });

  it.each(["", "  ", "x".repeat(1001)])("rejects an invalid search before sending it", async (query) => {
    await expect(searchLearn(query)).rejects.toThrow(/topic|1,000/);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example/azure/page",
    "https://learn.microsoft.com.evil.example/azure/page",
    "http://learn.microsoft.com/azure/page",
    "https://user:password@learn.microsoft.com/azure/page",
    "https://learn.microsoft.com/api/mcp",
    "https://learn.microsoft.com/en-us/search/",
    "https://learn.microsoft.com/",
    "https://learn.microsoft.com/azure/media/image.png",
  ])("rejects non-documentation URL %s before fetching", async (input) => {
    await expect(fetchLearnPage(input)).rejects.toThrow(/Microsoft Learn.*URL/);
    expect(mocks.safeFetch).not.toHaveBeenCalled();
  });

  it("normalizes Learn URLs without keeping query strings or fragments", () => {
    expect(normalizeLearnUrl(url + "?view=latest#intro")).toBe(url);
  });

  it("rejects an empty fetched page", async () => {
    respond(rpc("  "));
    await expect(fetchLearnPage(url)).rejects.toThrow(/empty|readable/i);
  });
});
