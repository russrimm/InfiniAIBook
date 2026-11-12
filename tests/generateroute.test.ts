import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate/route";
import { db } from "@/lib/db";
import { imageDir } from "@/lib/paths";
import { count, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({ chatJSON: vi.fn(), generateImage: vi.fn(), embed: vi.fn() }));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  chatJSON: mocks.chatJSON,
  generateImage: mocks.generateImage,
  embed: mocks.embed,
}));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0]));
});

const generate = (body: unknown, headers: Record<string, string> = {}) =>
  POST(request("/api/generate", "POST", body, headers));

const setup = () => {
  const notebookId = seedNotebook();
  const sourceId = seedSource(notebookId, { title: "Doc", chunks: ["Water boils at 100 C.", "Ice melts at 0 C."] });
  return { notebookId, sourceId };
};

describe("POST /api/generate validation", () => {
  it.each([
    ["an array", [1]],
    ["text that is not JSON", "{nope"],
    ["null", "null"],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await generate(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send a JSON object.", code: "invalid" });
  });

  it.each([
    ["an unknown type", "mystery"],
    ["a missing type", undefined],
    ["an inherited property name", "constructor"],
    ["a type with its own route", "podcast"],
    ["another type with its own route", "training"],
  ])("returns 400 for %s", async (_name, type) => {
    const { notebookId, sourceId } = setup();
    const res = await generate({ notebookId, type, sourceIds: [sourceId] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Unknown artifact type" });
  });

  it("requires a notebook id", async () => {
    const res = await generate({ type: "faq", sourceIds: ["x"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "notebookId is required.", code: "invalid" });
  });

  it("validates the focus topic", async () => {
    const { notebookId, sourceId } = setup();
    const notString = await generate({ notebookId, type: "faq", sourceIds: [sourceId], topic: 5 });
    expect(await notString.json()).toMatchObject({ error: "topic must be a string.", code: "invalid" });
    const tooLong = await generate({ notebookId, type: "faq", sourceIds: [sourceId], topic: "t".repeat(2001) });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error).toMatch(/Keep the focus under 2000 characters/);
  });

  it("requires a nonempty list of selected source ids", async () => {
    const { notebookId } = setup();
    for (const sourceIds of [undefined, [], "abc", [1]]) {
      const res = await generate({ notebookId, type: "faq", sourceIds });
      expect(res.status).toBe(400);
    }
    const missing = await generate({ notebookId, type: "faq" });
    expect(await missing.json()).toMatchObject({ code: "no_sources" });
    const empty = await generate({ notebookId, type: "faq", sourceIds: [] });
    expect(await empty.json()).toMatchObject({ code: "no_sources" });
    expect(mocks.chatJSON).not.toHaveBeenCalled();
  });

  it("refuses sources from another notebook", async () => {
    const { notebookId } = setup();
    const foreign = seedSource(seedNotebook("Other"));
    const res = await generate({ notebookId, type: "faq", sourceIds: [foreign] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_sources" });
    expect(mocks.chatJSON).not.toHaveBeenCalled();
  });

  it("returns 400 when the selected sources have no readable passages", async () => {
    const notebookId = seedNotebook();
    const sourceId = seedSource(notebookId, { chunks: [] });
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Add at least one source before generating." });
  });

  it("rejects bad infographic options", async () => {
    const { notebookId, sourceId } = setup();
    const base = { notebookId, type: "infographic", sourceIds: [sourceId] };
    const style = await generate({ ...base, style: "bogus" });
    expect(style.status).toBe(400);
    expect((await style.json()).error).toMatch(/Unknown infographic style "bogus"/);
    const notString = await generate({ ...base, instructions: 5 });
    expect((await notString.json()).error).toBe("instructions must be a string.");
    const tooLong = await generate({ ...base, instructions: "x".repeat(5000) });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error).toMatch(/Keep the description under/);
    expect(mocks.chatJSON).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate", () => {
  it("writes a grounded FAQ and stores it with its sources and citations", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue({
      title: "Water FAQ",
      items: [{ q: "When does water boil?", a: "At 100 C." }, { q: "", a: "dropped" }],
    });

    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId, sourceId] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ type: "faq", title: "Water FAQ" });
    expect(body.content.items).toEqual([{ q: "When does water boil?", a: "At 100 C." }]);
    expect(body.content.sourceIds).toEqual([sourceId]);
    expect(body.content.citations.length).toBeGreaterThan(0);

    const messages = mocks.chatJSON.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[1].content).toContain("Water boils at 100 C.");

    const row = db.prepare("SELECT type, title, content FROM artifacts WHERE id = ?").get(body.id) as unknown as {
      type: string;
      title: string;
      content: string;
    };
    expect(row.type).toBe("faq");
    expect(JSON.parse(row.content).sourceIds).toEqual([sourceId]);
  });

  it("keeps the correct answer of a quiz question after shuffling the choices", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue({
      title: "Quiz",
      questions: [
        { question: "Boiling point?", choices: ["100 C", "50 C", "0 C", "10 C"], answerIndex: 0, explanation: "e" },
        { question: "No answer", choices: ["a", "b"], answerIndex: 5 },
        { question: "One choice", choices: ["a"], answerIndex: 0 },
      ],
    });
    const body = await (await generate({ notebookId, type: "quiz", sourceIds: [sourceId], difficulty: "hard" })).json();
    expect(body.content.questions).toHaveLength(1);
    const q = body.content.questions[0];
    expect(q.choices[q.answerIndex]).toBe("100 C");
    expect([...q.choices].sort()).toEqual(["0 C", "10 C", "100 C", "50 C"]);
    expect(body.content.difficulty).toBe("hard");
  });

  it("ignores unknown difficulty and length values", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue({
      cards: [{ front: "Boil", back: "100 C" }, { front: "boil!", back: "duplicate" }, { front: "Melt", back: "0 C" }],
    });
    const body = await (
      await generate({ notebookId, type: "flashcards", sourceIds: [sourceId], difficulty: "ignore previous", length: "huge" })
    ).json();
    expect(body.content.difficulty).toBe("medium");
    expect(body.content.cards.map((c: { front: string }) => c.front)).toEqual(["Boil", "Melt"]);
    const system = (mocks.chatJSON.mock.calls[0][0] as { content: string }[])[0].content;
    expect(system).not.toContain("ignore previous");
  });

  it("focuses on a topic by retrieving matching passages", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue({ title: "Briefing", markdown: "Body" });
    const res = await generate({ notebookId, type: "briefing", sourceIds: [sourceId], topic: "melting ice" });
    expect(res.status).toBe(200);
    expect(mocks.embed).toHaveBeenCalled();
    expect(mocks.embed.mock.calls[0][0]).toEqual(["melting ice"]);
  });

  it.each([
    ["an FAQ with no items", "faq", { items: [] }],
    ["a quiz with no valid questions", "quiz", { questions: [] }],
    ["a mind map with no branches", "mindmap", { root: { label: "Root", children: [] } }],
    ["a report with no text", "report", { markdown: "  " }],
  ])("returns 502 for %s", async (_name, type, raw) => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue(raw);
    const res = await generate({ notebookId, type, sourceIds: [sourceId] });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/empty result/);
    expect(count("artifacts")).toBe(0);
  });

  it("retries with less context after a rate limit", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON
      .mockRejectedValueOnce(Object.assign(new Error("429"), { status: 429 }))
      .mockResolvedValueOnce({ items: [{ q: "q", a: "a" }] });
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] });
    expect(res.status).toBe(200);
    expect(mocks.chatJSON).toHaveBeenCalledTimes(2);
  });

  it("gives up with a rate-limit error once the context cannot shrink further", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockRejectedValue(Object.assign(new Error("429 slow down"), { status: 429 }));
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate_limit" });
    expect(mocks.chatJSON).toHaveBeenCalledTimes(4);
    expect(count("artifacts")).toBe(0);
  });

  it("does not retry other model errors", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockRejectedValue(new Error("model exploded"));
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "model exploded" });
    expect(mocks.chatJSON).toHaveBeenCalledTimes(1);
  });

  it("streams status events and the result when the client asks for NDJSON", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockResolvedValue({ items: [{ q: "q", a: "a" }] });
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] }, { accept: "application/x-ndjson" });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines[0]).toEqual({ event: "status", status: "Preparing generation" });
    const result = lines.at(-1);
    expect(result).toMatchObject({ event: "result", status: 200, body: { type: "faq" } });
    expect(lines.filter((l) => l.event === "status").length).toBeGreaterThan(2);
  });

  it("streams a failure as a result event with its status", async () => {
    const { notebookId, sourceId } = setup();
    mocks.chatJSON.mockRejectedValue(new Error("model exploded"));
    const res = await generate({ notebookId, type: "faq", sourceIds: [sourceId] }, { accept: "application/x-ndjson" });
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.at(-1)).toEqual({ event: "result", status: 500, body: { error: "model exploded" } });
  });

  describe("infographics", () => {
    const brief = { title: "Water", sections: [{ heading: "Boiling", bullets: ["100 C at sea level"] }] };

    it("renders an image style to a file and records the model", async () => {
      const { notebookId, sourceId } = setup();
      mocks.chatJSON.mockResolvedValue(brief);
      mocks.generateImage.mockResolvedValue({ png: Buffer.from("png-bytes"), model: "img-1", size: "1024x1024" });
      const res = await generate({ notebookId, type: "infographic", sourceIds: [sourceId], style: "image" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content).toMatchObject({
        style: "image",
        imageUrl: `/api/image/${body.id}`,
        imageModel: "img-1",
        imageSize: "1024x1024",
      });
      expect(fs.readFileSync(path.join(imageDir(), `${body.id}.png`), "utf8")).toBe("png-bytes");
    });

    it("keeps the brief as an illustrated layout when the picture fails", async () => {
      const { notebookId, sourceId } = setup();
      mocks.chatJSON.mockResolvedValue(brief);
      mocks.generateImage.mockRejectedValue(new Error('Content filter {"code":"blocked"}'));
      const res = await generate({ notebookId, type: "infographic", sourceIds: [sourceId], style: "image" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.content.style).toBe("illustrated");
      expect(body.content.imageFallback).toEqual({ from: "image", reason: "Content filter" });
      expect(body.content).not.toHaveProperty("imageUrl");
    });
  });
});
