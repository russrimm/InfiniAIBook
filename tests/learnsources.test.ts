import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { POST as discover } from "@/app/api/discover/route";
import { POST as addSource } from "@/app/api/notebooks/[id]/sources/route";
import { GET, PATCH } from "@/app/api/notebooks/[id]/route";

const mocks = vi.hoisted(() => ({ searchLearn: vi.fn(), fetchLearnPage: vi.fn() }));
vi.mock("@/lib/learn", async (original) => ({
  ...await original<typeof import("@/lib/learn")>(),
  ...mocks,
}));
vi.mock("@/lib/websearch", async (original) => ({
  ...await original<typeof import("@/lib/websearch")>(),
  searchWeb: vi.fn(async () => []),
}));
vi.mock("next/server", async (original) => ({
  ...await original<typeof import("next/server")>(),
  after: vi.fn(),
}));
vi.mock("@/lib/ai", async (original) => ({
  ...await original<typeof import("@/lib/ai")>(),
  embed: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
}));

const id = "learn-notebook";
const url = "https://learn.microsoft.com/en-us/azure/overview";
const ctx = { params: Promise.resolve({ id }) };
const request = (body: unknown, method = "POST") => new Request("http://localhost/api/test", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  db.prepare("DELETE FROM notebooks").run();
  db.prepare("INSERT INTO notebooks (id,title,emoji,created_at) VALUES (?,?,?,?)").run(id, "Learn notes", "L", 1);
  mocks.searchLearn.mockResolvedValue([{ title: "Azure overview", url, content: "Search excerpt" }]);
  mocks.fetchLearnPage.mockResolvedValue({ title: "Azure overview", url, text: "Full documentation, not the search excerpt." });
});
afterEach(() => vi.clearAllMocks());

describe("Microsoft Learn source APIs", () => {
  it("searches Learn explicitly rather than using general web search", async () => {
    const response = await discover(request({ notebookId: id, topic: "Azure", provider: "microsoft-learn" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "microsoft-learn", results: [{ title: "Azure overview", url, provider: "microsoft-learn", added: false }],
    });
  });

  it.each(["", "#intro", "?view=latest", "/"])(
    "returns one selectable source per Learn page despite duplicate passage URLs (%s)",
    async (suffix) => {
      const otherUrl = "https://learn.microsoft.com/en-us/azure/architecture";
      mocks.searchLearn.mockResolvedValue([
        { title: "Azure overview", url, content: "First ranked excerpt" },
        { title: "Another passage", url: url + suffix, content: "Second excerpt" },
        { title: "Azure architecture", url: otherUrl, content: "Architecture excerpt" },
      ]);

      const response = await discover(request({ notebookId: id, topic: "Azure", provider: "microsoft-learn" }));
      expect(response.status).toBe(200);
      expect((await response.json()).results).toEqual([
        {
          title: "Azure overview", url, snippet: "First ranked excerpt",
          host: "learn.microsoft.com", provider: "microsoft-learn", added: false,
        },
        {
          title: "Azure architecture", url: otherUrl, snippet: "Architecture excerpt",
          host: "learn.microsoft.com", provider: "microsoft-learn", added: false,
        },
      ]);
    },
  );

  it("marks a deduplicated Learn page as already added", async () => {
    await addSource(request({ learnUrl: url }), ctx);
    mocks.searchLearn.mockResolvedValue([
      { title: "Azure overview", url: url + "#intro", content: "First excerpt" },
      { title: "Azure overview", url, content: "Second excerpt" },
    ]);
    const response = await discover(request({ notebookId: id, topic: "Azure", provider: "microsoft-learn" }));
    expect(response.status).toBe(200);
    expect((await response.json()).results).toMatchObject([{ url: url + "#intro", added: true }]);
  });

  it("imports full documentation and chunks it as a saved URL source", async () => {
    const response = await addSource(request({ learnUrl: url }), ctx);
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT kind, url, text FROM sources WHERE notebook_id=?").get(id)).toMatchObject({
      kind: "url", url, text: "Full documentation, not the search excerpt.",
    });
    expect(db.prepare("SELECT text FROM chunks WHERE notebook_id=?").get(id)).toMatchObject({
      text: "Full documentation, not the search excerpt.",
    });
  });

  it("does not import the same Learn page twice", async () => {
    await addSource(request({ learnUrl: url }), ctx);
    const response = await addSource(request({ learnUrl: url + "#intro" }), ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/already/i) });
    expect(db.prepare("SELECT COUNT(*) AS n FROM sources WHERE notebook_id=?").get(id)).toMatchObject({ n: 1 });
  });

  it("rejects foreign page imports before calling Learn", async () => {
    const response = await addSource(request({ learnUrl: "https://example.com/doc" }), ctx);
    expect(response.status).toBe(400);
    expect(mocks.fetchLearnPage).not.toHaveBeenCalled();
  });

  it("persists an explicit live-mode opt-in only for that notebook", async () => {
    const initial = await GET(new Request("http://localhost"), ctx);
    expect((await initial.json()).notebook.liveLearn).toBe(false);
    const changed = await PATCH(request({ liveLearn: true }, "PATCH"), ctx);
    expect(changed.status).toBe(200);
    const response = await GET(new Request("http://localhost"), ctx);
    expect((await response.json()).notebook.liveLearn).toBe(true);
    await PATCH(request({ liveLearn: false }, "PATCH"), ctx);
    expect(db.prepare("SELECT live_learn FROM notebooks WHERE id=?").get(id)).toMatchObject({ live_learn: 0 });
  });

  it("rejects invalid live-mode settings without saving them", async () => {
    const response = await PATCH(request({ liveLearn: "true" }, "PATCH"), ctx);
    expect(response.status).toBe(400);
  });

  it("does not claim to save a setting for a nonexistent notebook", async () => {
    const response = await PATCH(request({ liveLearn: true }, "PATCH"), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
  });
});
