import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chat } from "@/app/api/chat/route";
import { GET as search } from "@/app/api/search/route";
import { POST as ask } from "@/app/api/search/ask/route";
import { db } from "@/lib/db";
import { embedModel } from "@/lib/ai";
import { LearnError } from "@/lib/learn";
import { createNote } from "@/lib/notes";
import { createSession } from "@/lib/sessions";
import { count, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  chatText: vi.fn(),
  chatStream: vi.fn(),
  searchLearn: vi.fn(),
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  embed: mocks.embed,
  chatText: mocks.chatText,
  chatStream: mocks.chatStream,
}));
vi.mock("@/lib/learn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learn")>()),
  searchLearn: mocks.searchLearn,
}));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0]));
  mocks.searchLearn.mockResolvedValue([]);
});

const parts = (...deltas: string[]) =>
  (async function* () {
    for (const content of deltas) yield { choices: [{ delta: { content } }] };
  })();

const events = async (res: Response) =>
  (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown> & { type: string });

const ask_ = (body: unknown, init?: { signal?: AbortSignal }) => {
  const req = request("/api/chat", "POST", body);
  return chat(init?.signal ? new Request(req, { signal: init.signal }) : req);
};

describe("POST /api/chat", () => {
  const ready = () => {
    const notebookId = seedNotebook();
    const sourceId = seedSource(notebookId, { title: "Solar", chunks: ["Solar panels convert sunlight."] });
    return { notebookId, sourceId };
  };

  it.each([
    ["no notebook", { message: "hi" }],
    ["no message", { notebookId: "nb" }],
    ["a blank message", { notebookId: "nb", message: "   " }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await ask_(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing notebookId or message" });
  });

  it("returns 400 when no source is selected", async () => {
    const { notebookId } = ready();
    const res = await ask_({ notebookId, message: "hi", sourceIds: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "no_sources" });
    expect(mocks.chatStream).not.toHaveBeenCalled();
  });

  it("returns 400 for a message over the length limit", async () => {
    const { notebookId } = ready();
    const res = await ask_({ notebookId, message: "x".repeat(20_001) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "too_long" });
  });

  it("returns 400 when the notebook has no sources", async () => {
    const notebookId = seedNotebook();
    const res = await ask_({ notebookId, message: "anything" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no sources yet/);
    expect(mocks.chatStream).not.toHaveBeenCalled();
  });

  it("returns 404 for a chat that does not exist or belongs to another notebook", async () => {
    const { notebookId } = ready();
    const foreign = createSession(seedNotebook("Other"));
    for (const sessionId of ["missing", foreign.id]) {
      const res = await ask_({ notebookId, message: "hi", sessionId });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "That chat no longer exists." });
    }
    expect(count("messages")).toBe(0);
  });

  it("streams the answer, then saves both turns and names the new chat", async () => {
    const { notebookId, sourceId } = ready();
    mocks.chatStream.mockResolvedValue(parts("Panels use light [1]", " and more."));

    const res = await ask_({ notebookId, message: "How do panels work?", sourceIds: [sourceId] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const all = await events(res);
    expect(all.map((e) => e.type)).toEqual(["session", "citations", "delta", "delta", "done"]);
    const done = all.at(-1)!;
    expect(done.stopped).toBe(false);
    expect(done.citations).toEqual([expect.objectContaining({ n: 1, sourceId, sourceTitle: "Solar" })]);

    const [system, user] = mocks.chatStream.mock.calls[0][0] as { role: string; content: string }[];
    expect(system.role).toBe("system");
    expect(system.content).toContain("Solar panels convert sunlight.");
    expect(user).toEqual({ role: "user", content: "How do panels work?" });

    const saved = db.prepare("SELECT role, content FROM messages ORDER BY created_at, role DESC").all() as unknown as {
      role: string;
      content: string;
    }[];
    expect(saved).toEqual([
      { role: "user", content: "How do panels work?" },
      { role: "assistant", content: "Panels use light [1] and more." },
    ]);
    const session = db.prepare("SELECT title FROM chat_sessions").get() as unknown as { title: string };
    expect(session.title).toBe("How do panels work?");
  });

  it("attaches no citations to an answer that cites nothing", async () => {
    const { notebookId } = ready();
    mocks.chatStream.mockResolvedValue(parts("An uncited answer."));
    const all = await events(await ask_({ notebookId, message: "q" }));
    expect(all.at(-1)).toMatchObject({ type: "done", citations: [] });
  });

  it("continues an existing chat and sends earlier turns without their citation numbers", async () => {
    const { notebookId } = ready();
    const session = createSession(notebookId);
    mocks.chatStream.mockResolvedValue(parts("First [1]"));
    await (await ask_({ notebookId, message: "first question", sessionId: session.id })).text();
    mocks.chatStream.mockResolvedValue(parts("Second"));
    await (await ask_({ notebookId, message: "follow up", sessionId: session.id })).text();

    const prompt = mocks.chatStream.mock.calls[1][0] as { role: string; content: string }[];
    expect(prompt.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(prompt[2].content).toContain("Earlier reply, not a source");
    expect(prompt[2].content).not.toContain("[1]");
    expect(count("messages", "session_id = ?", session.id)).toBe(4);
    expect(count("chat_sessions")).toBe(1);
  });

  it("limits retrieval to the selected sources", async () => {
    const { notebookId } = ready();
    const other = seedSource(notebookId, { title: "Wind", chunks: ["Wind turbines spin."] });
    mocks.chatStream.mockResolvedValue(parts("ok"));
    await (await ask_({ notebookId, message: "q", sourceIds: [other] })).text();
    const system = (mocks.chatStream.mock.calls[0][0] as { content: string }[])[0].content;
    expect(system).toContain("Wind turbines spin.");
    expect(system).not.toContain("Solar panels convert sunlight.");
  });

  it("reports passages embedded with another model so the user can re-embed", async () => {
    const notebookId = seedNotebook();
    seedSource(notebookId, { embedding: [0, 1], embedModel: "old-model" });
    mocks.chatStream.mockResolvedValue(parts("ok"));
    const all = await events(await ask_({ notebookId, message: "q" }));
    const notice = all.find((e) => e.type === "notice");
    expect(notice?.notice).toMatch(/old-model, not the current .*Re-embed this notebook/);
  });

  it("reports an empty model answer as an error and saves no answer", async () => {
    const { notebookId } = ready();
    mocks.chatStream.mockResolvedValue(parts("  "));
    const all = await events(await ask_({ notebookId, message: "q" }));
    expect(all.at(-1)).toMatchObject({ type: "error", error: expect.stringMatching(/empty answer/) });
    expect(count("messages", "role = 'assistant'")).toBe(0);
    expect(count("messages", "role = 'user'")).toBe(1);
  });

  it("reports a stream that fails part-way as an error event", async () => {
    const { notebookId } = ready();
    mocks.chatStream.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: "Partial" } }] };
        throw new Error("connection reset");
      })(),
    );
    const all = await events(await ask_({ notebookId, message: "q" }));
    expect(all.at(-1)).toEqual({ type: "error", error: "connection reset" });
    expect(count("messages", "role = 'assistant'")).toBe(0);
  });

  it("keeps what was said, marked as cut short, when the reader stops the answer", async () => {
    const { notebookId } = ready();
    const stop = new AbortController();
    mocks.chatStream.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: "Partial" } }] };
        stop.abort();
        yield { choices: [{ delta: { content: " tail" } }] };
      })(),
    );
    const all = await events(await ask_({ notebookId, message: "q" }, { signal: stop.signal }));
    expect(all.at(-1)).toMatchObject({ type: "done", stopped: true });
    const row = db.prepare("SELECT content FROM messages WHERE role = 'assistant'").get() as unknown as {
      content: string;
    };
    expect(row.content).toBe("Partial tail\n\n_(Stopped before the answer was finished.)_");
  });

  it("maps a provider authentication failure to 401 and records nothing", async () => {
    const { notebookId } = ready();
    mocks.chatStream.mockRejectedValue(Object.assign(new Error("401 Unauthorized"), { status: 401 }));
    const res = await ask_({ notebookId, message: "q" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth" });
    expect(count("messages")).toBe(0);
  });

  describe("with live Microsoft Learn documentation", () => {
    it("answers from Learn pages even when no saved source is selected", async () => {
      const notebookId = seedNotebook("Live", true);
      mocks.searchLearn.mockResolvedValue([
        { title: "Overview", content: "Learn says hello.", url: "https://learn.microsoft.com/a" },
      ]);
      mocks.chatStream.mockResolvedValue(parts("Hello [1]"));
      const res = await ask_({ notebookId, message: "hello", sourceIds: [] });
      expect(res.status).toBe(200);
      const all = await events(res);
      const citations = all.find((e) => e.type === "citations")!.citations as { url: string }[];
      expect(citations[0].url).toBe("https://learn.microsoft.com/a");
      expect(mocks.searchLearn).toHaveBeenCalledWith("hello");
    });

    it("returns 400 when Learn finds nothing and there is no saved source", async () => {
      const notebookId = seedNotebook("Live", true);
      const res = await ask_({ notebookId, message: "obscure" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Microsoft Learn found no matching documentation/);
    });

    it("reports Learn being unreachable with its own code", async () => {
      const notebookId = seedNotebook("Live", true);
      mocks.searchLearn.mockRejectedValue(new LearnError("Microsoft Learn is unreachable."));
      const res = await ask_({ notebookId, message: "q" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "Microsoft Learn is unreachable.", code: "learn_unavailable" });
    });
  });
});

describe("GET /api/search", () => {
  const find = async (query: string) => {
    const res = await search(request(`/api/search${query}`));
    return { res, body: await res.json() };
  };

  it("returns an empty result for a blank query without searching", async () => {
    const { res, body } = await find("?q=%20%20");
    expect(res.status).toBe(200);
    expect(body).toEqual({ query: "", mode: "text", semantic: false, hits: [], notes: [] });
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("finds passages and notes by keyword across notebooks", async () => {
    const a = seedNotebook("Energy");
    const b = seedNotebook("Cooking");
    seedSource(a, { title: "Solar", chunks: ["Photovoltaic cells make electricity."] });
    seedSource(b, { title: "Recipes", chunks: ["Bake bread slowly."] });
    createNote({ notebookId: a, title: "Cells", content: "My notes on photovoltaic cells" });
    createNote({ notebookId: b, title: "Unrelated", content: "Sourdough starter" });

    const { body } = await find("?q=photovoltaic");
    expect(body.mode).toBe("text");
    expect(body.semantic).toBe(false);
    expect(body.hits).toEqual([
      expect.objectContaining({ notebookId: a, notebookTitle: "Energy", sourceTitle: "Solar", part: 1 }),
    ]);
    expect(body.hits[0].snippet).toContain("Photovoltaic cells");
    expect(body.notes).toEqual([expect.objectContaining({ notebookId: a, title: "Cells", kind: "human" })]);
    expect(body.notes[0].snippet).toContain("photovoltaic cells");
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("limits the search to one notebook", async () => {
    const a = seedNotebook("A");
    const b = seedNotebook("B");
    seedSource(a, { chunks: ["shared keyword here"] });
    seedSource(b, { chunks: ["shared keyword there"] });
    const { body } = await find(`?q=keyword&notebookId=${b}`);
    expect(body.hits.map((h: { notebookId: string }) => h.notebookId)).toEqual([b]);
  });

  it("treats percent and underscore in a query literally when matching notes", async () => {
    const nb = seedNotebook();
    createNote({ notebookId: nb, content: "Growth was 50% last year" });
    createNote({ notebookId: nb, content: "Growth was 50 last year" });
    const { body } = await find("?q=50%25");
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].snippet).toContain("50%");
  });

  it("ranks by meaning in vector mode and says the search was semantic", async () => {
    const nb = seedNotebook();
    const model = embedModel();
    seedSource(nb, { title: "Close", chunks: ["unrelated words"], embedding: [1, 0], embedModel: model });
    seedSource(nb, { title: "Far", chunks: ["more words"], embedding: [0, 1], embedModel: model });
    const { body } = await find("?q=something&mode=vector");
    expect(body.mode).toBe("vector");
    expect(body.semantic).toBe(true);
    expect(body.hits.map((h: { sourceTitle: string }) => h.sourceTitle)).toEqual(["Close"]);
    expect(body.hits[0].score).toBeGreaterThan(0.8);
  });

  it("falls back to keywords when the embedder fails", async () => {
    const nb = seedNotebook();
    seedSource(nb, { chunks: ["keyword match"], embedding: [1, 0], embedModel: embedModel() });
    mocks.embed.mockRejectedValue(new Error("no embedder"));
    const { res, body } = await find("?q=keyword&mode=vector");
    expect(res.status).toBe(200);
    expect(body.semantic).toBe(false);
    expect(body.hits).toHaveLength(1);
  });

  it("treats an unknown mode as text and caps the query length", async () => {
    const { body } = await find(`?q=${"a".repeat(600)}&mode=other`);
    expect(body.mode).toBe("text");
    expect(body.query).toHaveLength(500);
  });
});

describe("POST /api/search/ask", () => {
  const post = (body: unknown) => ask(request("/api/search/ask", "POST", body));

  it.each([["no question", {}], ["a blank question", { question: "  " }]])("returns 400 for %s", async (_n, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Ask a question." });
  });

  it("says so when nothing matches, without calling the model", async () => {
    const res = await post({ question: "anything" });
    expect(await res.json()).toEqual({
      answer: "Nothing in your notebooks matches that question.",
      citations: [],
    });
    expect(mocks.chatText).not.toHaveBeenCalled();
  });

  it("answers from several notebooks and returns only the citations it used", async () => {
    const a = seedNotebook("Energy");
    const b = seedNotebook("Cooking");
    const model = embedModel();
    seedSource(a, { title: "Solar", chunks: ["Panels make power."], embedding: [1, 0], embedModel: model });
    seedSource(b, { title: "Recipes", chunks: ["Bread needs time."], embedding: [0.9, 0.1], embedModel: model });
    mocks.chatText.mockResolvedValue("Panels make power [1].");

    const res = await post({ question: "What makes power?" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe("Panels make power [1].");
    expect(body.citations).toEqual([
      expect.objectContaining({ n: 1, notebookId: a, notebookTitle: "Energy", sourceTitle: "Solar", part: 1 }),
    ]);
    const system = (mocks.chatText.mock.calls[0][0] as { content: string }[])[0].content;
    expect(system).toContain('in notebook "Cooking"');
  });

  it("restricts the answer to one notebook when asked", async () => {
    const a = seedNotebook("A");
    const b = seedNotebook("B");
    seedSource(a, { chunks: ["alpha content"] });
    seedSource(b, { chunks: ["beta content"] });
    mocks.chatText.mockResolvedValue("done [1]");
    const body = await (await post({ question: "content", notebookId: b })).json();
    expect(body.citations.map((c: { notebookId: string }) => c.notebookId)).toEqual([b]);
  });

  it("reports a model failure", async () => {
    seedSource(seedNotebook(), { chunks: ["some content"] });
    mocks.chatText.mockRejectedValue(Object.assign(new Error("429"), { status: 429 }));
    const res = await post({ question: "content" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate_limit" });
  });
});
