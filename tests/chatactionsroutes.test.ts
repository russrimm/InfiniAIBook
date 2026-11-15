import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as chat } from "@/app/api/chat/route";
import { POST as suggest } from "@/app/api/chat/suggest/route";
import { GET as exportChat } from "@/app/api/sessions/[id]/export/route";
import { db } from "@/lib/db";
import { BudgetExceededError } from "@/lib/budget";
import { sessionMessages } from "@/lib/sessions";
import { count, idCtx, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  chatText: vi.fn(),
  chatStream: vi.fn(),
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  embed: mocks.embed,
  chatText: mocks.chatText,
  chatStream: mocks.chatStream,
}));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0]));
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

const post = (body: unknown, signal?: AbortSignal) => {
  const req = request("/api/chat", "POST", body);
  return chat(signal ? new Request(req, { signal }) : req);
};

/** A notebook with one source and a two-question chat. */
async function seedChat() {
  const notebookId = seedNotebook("Garden");
  const sourceId = seedSource(notebookId, { title: "Pilot", chunks: ["The pilot builds 24 raised beds."] });
  mocks.chatStream.mockResolvedValueOnce(parts("Twenty-four [1]."));
  const first = await events(await post({ notebookId, message: "How many beds?", sourceIds: [sourceId] }));
  const sessionId = (first[0].session as { id: string }).id;
  mocks.chatStream.mockResolvedValueOnce(parts("They cost $640 [1]."));
  await (await post({ notebookId, message: "What do they cost?", sourceIds: [sourceId], sessionId })).text();
  const [u1, a1, u2, a2] = sessionMessages(sessionId);
  return { notebookId, sourceId, sessionId, u1, a1, u2, a2 };
}

const stored = (sessionId: string) => sessionMessages(sessionId).map((m) => `${m.role}: ${m.content}`);

describe("POST /api/chat with mode regenerate", () => {
  it("replaces the last answer instead of adding another, and re-asks the same question", async () => {
    const c = await seedChat();
    mocks.chatStream.mockResolvedValue(parts("A new take [1]."));
    const res = await post({ notebookId: c.notebookId, message: "ignored", sourceIds: [c.sourceId], sessionId: c.sessionId, mode: "regenerate", messageId: c.a2.id });
    expect(res.status).toBe(200);
    const all = await events(res);
    expect(all[0].userId).toBeUndefined();
    expect(all.at(-1)).toMatchObject({ type: "done", stopped: false });

    expect(stored(c.sessionId)).toEqual([
      "user: How many beds?",
      "assistant: Twenty-four [1].",
      "user: What do they cost?",
      "assistant: A new take [1].",
    ]);
    expect(count("messages", "id = ?", c.a2.id)).toBe(0);
    expect(count("messages", "id = ?", c.u2.id)).toBe(1);

    const [call] = mocks.chatStream.mock.calls.at(-1)! as [{ role: string; content: string }[], number];
    expect(call.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(call.at(-1)?.content).toBe("What do they cost?");
    expect(mocks.chatStream.mock.calls.at(-1)![1]).toBeGreaterThan(0.25);
  });

  it("keeps a stopped partial as the replacement", async () => {
    const c = await seedChat();
    const stop = new AbortController();
    mocks.chatStream.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: "Partial" } }] };
        stop.abort();
        yield { choices: [{ delta: { content: " tail" } }] };
      })(),
    );
    const res = await post({ notebookId: c.notebookId, message: "x", sessionId: c.sessionId, mode: "regenerate", messageId: c.a2.id }, stop.signal);
    expect((await events(res)).at(-1)).toMatchObject({ type: "done", stopped: true });
    const last = stored(c.sessionId).at(-1)!;
    expect(last).toContain("assistant: Partial tail");
    expect(count("messages", "session_id = ?", c.sessionId)).toBe(4);
  });

  it("leaves the old answer when the new one fails or comes back empty", async () => {
    const c = await seedChat();
    const body = { notebookId: c.notebookId, message: "x", sessionId: c.sessionId, mode: "regenerate", messageId: c.a2.id };
    mocks.chatStream.mockResolvedValueOnce(parts(" "));
    expect((await events(await post(body))).at(-1)).toMatchObject({ type: "error" });
    mocks.chatStream.mockResolvedValueOnce(
      (async function* () {
        yield { choices: [{ delta: { content: "Half" } }] };
        throw new Error("connection reset");
      })(),
    );
    expect((await events(await post(body))).at(-1)).toMatchObject({ type: "error", error: "connection reset" });
    expect(stored(c.sessionId).at(-1)).toBe("assistant: They cost $640 [1].");
  });

  it("is refused by the daily budget without touching the chat", async () => {
    const c = await seedChat();
    mocks.chatStream.mockRejectedValue(new BudgetExceededError("Daily model budget reached"));
    const res = await post({ notebookId: c.notebookId, message: "x", sessionId: c.sessionId, mode: "regenerate", messageId: c.a2.id });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "budget" });
    expect(stored(c.sessionId)).toHaveLength(4);
    expect(stored(c.sessionId).at(-1)).toBe("assistant: They cost $640 [1].");
  });

  it("answers 409 for an answer that is not the latest and 400 without a chat", async () => {
    const c = await seedChat();
    const base = { notebookId: c.notebookId, message: "x", mode: "regenerate" };
    const old = await post({ ...base, sessionId: c.sessionId, messageId: c.a1.id });
    expect(old.status).toBe(409);
    expect(await old.json()).toMatchObject({ code: "not_latest" });
    expect((await post({ ...base, messageId: c.a2.id })).status).toBe(400);
    expect((await post({ ...base, sessionId: c.sessionId, messageId: "gone" })).status).toBe(404);
    expect(mocks.chatStream).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/chat with mode edit", () => {
  it("discards the message and everything after it, then answers the edited question", async () => {
    const c = await seedChat();
    mocks.chatStream.mockResolvedValue(parts("Thirty [1]."));
    const res = await post({ notebookId: c.notebookId, message: "How many beds in total?", sourceIds: [c.sourceId], sessionId: c.sessionId, mode: "edit", messageId: c.u1.id });
    const all = await events(res);
    expect(all[0].userId).toEqual(expect.any(String));
    expect(stored(c.sessionId)).toEqual(["user: How many beds in total?", "assistant: Thirty [1]."]);
    expect(count("messages", "id IN (?, ?, ?)", c.u1.id, c.a1.id, c.u2.id)).toBe(0);

    const prompt = mocks.chatStream.mock.calls.at(-1)![0] as { role: string; content: string }[];
    expect(prompt.map((m) => m.role)).toEqual(["system", "user"]);
    expect(prompt.at(-1)?.content).toBe("How many beds in total?");
  });

  it("keeps earlier turns as memory when a later question is edited", async () => {
    const c = await seedChat();
    mocks.chatStream.mockResolvedValue(parts("About $700 [1]."));
    await (await post({ notebookId: c.notebookId, message: "And the price?", sourceIds: [c.sourceId], sessionId: c.sessionId, mode: "edit", messageId: c.u2.id })).text();
    expect(stored(c.sessionId)).toEqual([
      "user: How many beds?",
      "assistant: Twenty-four [1].",
      "user: And the price?",
      "assistant: About $700 [1].",
    ]);
    const prompt = mocks.chatStream.mock.calls.at(-1)![0] as { role: string }[];
    expect(prompt.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("renames a chat that was named after the edited first question", async () => {
    const c = await seedChat();
    const title = () => (db.prepare("SELECT title FROM chat_sessions WHERE id = ?").get(c.sessionId) as unknown as { title: string }).title;
    expect(title()).toBe("How many beds?");
    mocks.chatStream.mockResolvedValue(parts("Okay [1]."));
    await (await post({ notebookId: c.notebookId, message: "Which crops grow?", sessionId: c.sessionId, mode: "edit", messageId: c.u1.id })).text();
    expect(title()).toBe("Which crops grow?");
  });

  it("leaves the chat as it was when the model refuses the request", async () => {
    const c = await seedChat();
    mocks.chatStream.mockRejectedValue(Object.assign(new Error("401 Unauthorized"), { status: 401 }));
    const res = await post({ notebookId: c.notebookId, message: "changed", sessionId: c.sessionId, mode: "edit", messageId: c.u1.id });
    expect(res.status).toBe(401);
    expect(stored(c.sessionId)).toHaveLength(4);
    expect(stored(c.sessionId)[0]).toBe("user: How many beds?");
  });

  it("only edits the user's own messages that exist in this chat", async () => {
    const c = await seedChat();
    const base = { notebookId: c.notebookId, message: "changed", sessionId: c.sessionId, mode: "edit" };
    expect((await post({ ...base, messageId: c.a1.id })).status).toBe(400);
    expect((await post({ ...base, messageId: "gone" })).status).toBe(404);
    expect((await post({ ...base, messageId: c.u1.id, mode: "rewind" })).status).toBe(400);
    expect(stored(c.sessionId)).toHaveLength(4);
    expect(mocks.chatStream).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/chat/suggest", () => {
  const ask = (body: unknown) => suggest(request("/api/chat/suggest", "POST", body));

  it("returns grounded follow-ups for the latest answer and does not ask the model twice", async () => {
    const c = await seedChat();
    mocks.chatText.mockResolvedValue('{"suggestions":["What else do the beds need?","Who maintains them?"]}');
    const body = { sessionId: c.sessionId, messageId: c.a2.id };
    const res = await ask(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: ["What else do the beds need?", "Who maintains them?"] });
    const prompt = mocks.chatText.mock.calls[0][0] as { content: string }[];
    expect(prompt[1].content).toContain("What do they cost?");
    expect(prompt[1].content).toContain("Pilot");
    await ask(body);
    expect(mocks.chatText).toHaveBeenCalledTimes(1);
  });

  it("makes no model call for an answer that cites nothing", async () => {
    const notebookId = seedNotebook();
    seedSource(notebookId);
    mocks.chatStream.mockResolvedValue(parts("No markers here."));
    const first = await events(await post({ notebookId, message: "q" }));
    const sessionId = (first[0].session as { id: string }).id;
    const answer = sessionMessages(sessionId).at(-1)!;
    const res = await ask({ sessionId, messageId: answer.id });
    expect(await res.json()).toEqual({ suggestions: [] });
    expect(mocks.chatText).not.toHaveBeenCalled();
  });

  it("reports a model failure so the client can stay silent, and refuses stale or unknown targets", async () => {
    const c = await seedChat();
    mocks.chatText.mockRejectedValue(Object.assign(new Error("429"), { status: 429 }));
    expect((await ask({ sessionId: c.sessionId, messageId: c.a2.id })).status).toBe(429);
    expect((await ask({ sessionId: c.sessionId, messageId: c.a1.id })).status).toBe(409);
    expect((await ask({ sessionId: c.sessionId, messageId: "gone" })).status).toBe(404);
    expect((await ask({ sessionId: "gone", messageId: c.a2.id })).status).toBe(404);
    expect((await ask({})).status).toBe(400);
  });
});

describe("GET /api/sessions/[id]/export", () => {
  it("downloads the chat as Markdown with its citations and source names", async () => {
    const c = await seedChat();
    const res = await exportChat(request(`/api/sessions/${c.sessionId}/export`), idCtx(c.sessionId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="how-many-beds.md"');
    const md = await res.text();
    expect(md).toContain("# How many beds?");
    expect(md).toContain("_Notebook: Garden · Exported ");
    expect(md).toContain("> What do they cost?");
    expect(md).toContain("They cost $640 [1].");
    expect(md).toMatch(/- \[1\] Pilot \(part 1\): “The pilot builds 24 raised beds/);
  });

  it("returns 404 for a chat that does not exist", async () => {
    const res = await exportChat(request("/api/sessions/nope/export"), idCtx("nope"));
    expect(res.status).toBe(404);
  });
});
