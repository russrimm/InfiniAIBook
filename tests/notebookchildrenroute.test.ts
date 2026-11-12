import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listNotes, POST as createNote } from "@/app/api/notebooks/[id]/notes/route";
import { GET as listSessions, POST as createSession } from "@/app/api/notebooks/[id]/sessions/route";
import { GET as reembedStatus, POST as reembed } from "@/app/api/notebooks/[id]/reembed/route";
import { GET as pendingChanges, POST as checkSources } from "@/app/api/notebooks/[id]/check-sources/route";
import { db } from "@/lib/db";
import { embedModel } from "@/lib/ai";
import { count, idCtx, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({ embed: vi.fn(), extractFromUrl: vi.fn() }));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  embed: mocks.embed,
}));
vi.mock("@/lib/ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingest")>()),
  extractFromUrl: mocks.extractFromUrl,
}));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/api/notebooks/[id]/notes", () => {
  it("returns 404 for an unknown notebook", async () => {
    expect((await listNotes(request("/x"), idCtx("missing"))).status).toBe(404);
    const res = await createNote(request("/x", "POST", { content: "hi" }), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it.each([["missing content", {}], ["blank content", { content: "  \n " }]])(
    "rejects a note with %s",
    async (_name, body) => {
      const id = seedNotebook();
      const res = await createNote(request("/x", "POST", body), idCtx(id));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "A note needs some content." });
      expect(count("notes")).toBe(0);
    },
  );

  it("creates a note titled from its first line and lists it", async () => {
    const id = seedNotebook();
    const res = await createNote(request("/x", "POST", { content: "# Heading line\nbody" }), idCtx(id));
    expect(res.status).toBe(201);
    const { note } = await res.json();
    expect(note).toMatchObject({ notebookId: id, title: "Heading line", kind: "human", sourceId: null });

    const listed = await (await listNotes(request("/x"), idCtx(id))).json();
    expect(listed.notes).toHaveLength(1);
    expect(listed.notes[0].id).toBe(note.id);
  });

  it("keeps an AI kind, explicit title and citations, and falls back to human for anything else", async () => {
    const id = seedNotebook();
    const citations = [{ n: 1, sourceId: "s1", sourceTitle: "Doc", part: 1, snippet: "x" }];
    const ai = await (
      await createNote(request("/x", "POST", { content: "answer", title: "Saved answer", kind: "ai", citations }), idCtx(id))
    ).json();
    expect(ai.note).toMatchObject({ title: "Saved answer", kind: "ai", citations });

    const odd = await (
      await createNote(request("/x", "POST", { content: "x", kind: "robot", citations: "nope" }), idCtx(id))
    ).json();
    expect(odd.note.kind).toBe("human");
    expect(odd.note.citations).toBeUndefined();
  });
});

describe("/api/notebooks/[id]/sessions", () => {
  it("returns 404 for an unknown notebook", async () => {
    expect((await listSessions(request("/x"), idCtx("missing"))).status).toBe(404);
    expect((await createSession(request("/x", "POST", {}), idCtx("missing"))).status).toBe(404);
  });

  it("creates a titled chat and lists it with its message count", async () => {
    const id = seedNotebook();
    const res = await createSession(request("/x", "POST", { title: "  Plan  " }), idCtx(id));
    expect(res.status).toBe(201);
    const { session } = await res.json();
    expect(session).toMatchObject({ notebookId: id, title: "Plan", messageCount: 0 });

    const listed = await (await listSessions(request("/x"), idCtx(id))).json();
    expect(listed.sessions).toEqual([expect.objectContaining({ id: session.id, messageCount: 0 })]);
  });

  it("names a chat New chat when no usable title comes with the request", async () => {
    const id = seedNotebook();
    for (const body of [undefined, "{nope", { title: "   " }]) {
      const res = await createSession(request("/x", "POST", body), idCtx(id));
      expect(res.status).toBe(201);
      expect((await res.json()).session.title).toBe("New chat");
    }
  });
});

describe("/api/notebooks/[id]/reembed", () => {
  const model = () => embedModel();

  it("returns 404 for an unknown notebook without calling the embedder", async () => {
    const res = await reembed(request("/x", "POST"), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Notebook not found" });
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("reports an up-to-date notebook without re-embedding", async () => {
    const id = seedNotebook();
    seedSource(id, { embedding: [1, 0], embedModel: model() });
    const res = await reembed(request("/x", "POST"), idCtx(id));
    expect(await res.json()).toEqual({ reembedded: 0, model: model(), upToDate: true });
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("re-embeds only chunks that are missing or from another model", async () => {
    const id = seedNotebook();
    seedSource(id, { chunks: ["fresh"], embedding: [1, 0], embedModel: model() });
    seedSource(id, { chunks: ["missing one", "other model"] });
    seedSource(id, { chunks: ["old model"], embedding: [0, 1], embedModel: "old-embed" });
    mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [0.5, 0.5, 0.5]));

    const res = await reembed(request("/x", "POST"), idCtx(id));
    expect(await res.json()).toEqual({ reembedded: 3, model: model(), upToDate: false });
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.embed.mock.calls[0][0].sort()).toEqual(["missing one", "old model", "other model"]);
    expect(mocks.embed.mock.calls[0][1]).toBe(model());
    expect(count("chunks", "notebook_id = ? AND embed_model = ? AND embed_dims = 3", id, model())).toBe(3);
  });

  it("skips chunks the provider returns no vector for", async () => {
    const id = seedNotebook();
    seedSource(id, { chunks: ["a", "b"] });
    mocks.embed.mockResolvedValue([[1, 2]]);
    const body = await (await reembed(request("/x", "POST"), idCtx(id))).json();
    expect(body.reembedded).toBe(1);
    expect(count("chunks", "notebook_id = ? AND embedding IS NULL", id)).toBe(1);
  });

  it("keeps batches already saved when a later batch fails", async () => {
    const id = seedNotebook();
    seedSource(id, { chunks: Array.from({ length: 65 }, (_, i) => `chunk ${i}`) });
    mocks.embed
      .mockImplementationOnce(async (texts: string[]) => texts.map(() => [1]))
      .mockRejectedValueOnce(new Error("provider down"));
    const res = await reembed(request("/x", "POST"), idCtx(id));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "provider down" });
    expect(count("chunks", "notebook_id = ? AND embedding IS NOT NULL", id)).toBe(64);
  });

  it("maps provider authentication failures to a 401 with a code", async () => {
    const id = seedNotebook();
    seedSource(id);
    mocks.embed.mockRejectedValue(Object.assign(new Error("401 Unauthorized"), { status: 401 }));
    const res = await reembed(request("/x", "POST"), idCtx(id));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth" });
  });

  it("counts missing and stale chunks without changing anything", async () => {
    const id = seedNotebook();
    seedSource(id, { chunks: ["a"], embedding: [1, 0], embedModel: model() });
    seedSource(id, { chunks: ["b"] });
    seedSource(id, { chunks: ["c"], embedding: [1, 0, 0], embedModel: "old-embed" });

    const body = await (await reembedStatus(request("/x"), idCtx(id))).json();
    expect(body).toMatchObject({ currentModel: model(), total: 3, missing: 1, stale: 1 });
    expect(body.models).toEqual(
      expect.arrayContaining([
        { model: model(), dims: 2 },
        { model: "old-embed", dims: 3 },
      ]),
    );
    expect(mocks.embed).not.toHaveBeenCalled();
  });

  it("reports zeros for an empty or unknown notebook", async () => {
    const body = await (await reembedStatus(request("/x"), idCtx("missing"))).json();
    expect(body).toMatchObject({ total: 0, missing: 0, stale: 0, models: [] });
  });
});

describe("/api/notebooks/[id]/check-sources", () => {
  const oldText = Array.from({ length: 80 }, (_, i) => `alpha${i}`).join(" ");
  const newText = Array.from({ length: 80 }, (_, i) => `omega${i}`).join(" ");

  it("lists nothing pending for a notebook with no changes", async () => {
    const id = seedNotebook();
    seedSource(id, { url: "https://example.com/a" });
    expect(await (await pendingChanges(request("/x"), idCtx(id))).json()).toEqual({ pending: [] });
  });

  it("describes pending changes with a summary of the difference", async () => {
    const id = seedNotebook();
    const sourceId = seedSource(id, {
      title: "Page",
      url: "https://example.com/a",
      chunks: [oldText],
      pending: { text: newText, title: "Page v2" },
    });
    const { pending } = await (await pendingChanges(request("/x"), idCtx(id))).json();
    expect(pending).toEqual([
      expect.objectContaining({
        id: sourceId,
        title: "Page",
        newTitle: "Page v2",
        url: "https://example.com/a",
        oldChars: oldText.length,
        newChars: newText.length,
        addedLines: 1,
        removedLines: 1,
      }),
    ]);
  });

  it("re-fetches linked sources and records a material change without applying it", async () => {
    const id = seedNotebook();
    const sourceId = seedSource(id, { title: "Page", url: "https://example.com/a", chunks: [oldText] });
    seedSource(id, { title: "Pasted" });
    mocks.extractFromUrl.mockResolvedValue({ title: "Page v2", text: newText, kind: "url" });

    const res = await checkSources(request("/x", "POST", {}), idCtx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ checked: 1, skipped: 0, changed: 1, errors: [] });
    expect(body.pending).toEqual([expect.objectContaining({ id: sourceId, newTitle: "Page v2" })]);
    expect(mocks.extractFromUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/a");
    const row = db.prepare("SELECT text FROM sources WHERE id = ?").get(sourceId) as unknown as { text: string };
    expect(row.text).toBe(oldText);
  });

  it("skips sources checked recently and sources already awaiting a decision unless forced", async () => {
    const id = seedNotebook();
    seedSource(id, { url: "https://example.com/recent", checkedAt: Date.now() });
    seedSource(id, { url: "https://example.com/pending", pending: { text: newText }, checkedAt: 1 });
    mocks.extractFromUrl.mockResolvedValue({ title: "Same", text: "same", kind: "url" });

    const normal = await (await checkSources(request("/x", "POST", {}), idCtx(id))).json();
    expect(normal).toMatchObject({ checked: 0, skipped: 2, changed: 0 });
    expect(mocks.extractFromUrl).not.toHaveBeenCalled();

    const forced = await (await checkSources(request("/x", "POST", { force: true }), idCtx(id))).json();
    expect(forced).toMatchObject({ checked: 1, skipped: 1 });
    expect(mocks.extractFromUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/recent");
  });

  it("reports a fetch failure per source and keeps checking the rest", async () => {
    const id = seedNotebook();
    seedSource(id, { title: "Broken", url: "https://example.com/broken" });
    mocks.extractFromUrl.mockRejectedValue(new Error("HTTP 500"));
    const body = await (await checkSources(request("/x", "POST", { force: true }), idCtx(id))).json();
    expect(body).toMatchObject({ checked: 1, changed: 0, errors: ["Broken: HTTP 500"] });
    expect(count("sources", "notebook_id = ? AND check_error = 'HTTP 500'", id)).toBe(1);
  });

  it("treats a missing or malformed body as no options", async () => {
    const id = seedNotebook();
    const res = await checkSources(request("/x", "POST", "{nope"), idCtx(id));
    expect(await res.json()).toMatchObject({ checked: 0, skipped: 0, pending: [] });
  });
});
