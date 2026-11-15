import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listLibrary } from "@/app/api/sources/route";
import { DELETE as deleteSource, GET as getSource, POST as decideSource } from "@/app/api/sources/[id]/route";
import { DELETE as deleteNote, GET as getNote, PATCH as patchNote } from "@/app/api/notes/[id]/route";
import { DELETE as deleteSession, GET as getSession, PATCH as patchSession } from "@/app/api/sessions/[id]/route";
import { DELETE as deleteArtifact, GET as getArtifact } from "@/app/api/artifacts/[id]/route";
import { db } from "@/lib/db";
import { createNote } from "@/lib/notes";
import { createSession } from "@/lib/sessions";
import { count, idCtx, request, resetNotebooks, seedArtifact, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  chatText: vi.fn(),
  removeAudio: vi.fn(),
  removeImage: vi.fn(),
  removeVideo: vi.fn(),
  forgetTraining: vi.fn(),
  reconcileStalledVideo: vi.fn(),
  resumeStalledTraining: vi.fn(),
  reconcileStalledPodcast: vi.fn(),
}));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  embed: mocks.embed,
  chatText: mocks.chatText,
}));
vi.mock("@/lib/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paths")>()),
  removeAudio: mocks.removeAudio,
  removeImage: mocks.removeImage,
  removeVideo: mocks.removeVideo,
}));
vi.mock("@/lib/videobuild", () => ({ reconcileStalledVideo: mocks.reconcileStalledVideo }));
vi.mock("@/lib/trainingbuild", () => ({
  forgetTraining: mocks.forgetTraining,
  resumeStalledTraining: mocks.resumeStalledTraining,
}));
vi.mock("@/lib/podcaststore", () => ({ reconcileStalledPodcast: mocks.reconcileStalledPodcast }));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 2]));
  mocks.chatText.mockResolvedValue("Summary.");
});

describe("GET /api/sources", () => {
  it("lists every source with its notebook, optionally leaving one notebook out", async () => {
    const a = seedNotebook("Alpha");
    const b = seedNotebook("Beta");
    seedSource(a, { title: "A1" });
    seedSource(b, { title: "B1", url: "https://example.com/b" });

    const all = (await (await listLibrary(request("/api/sources"))).json()).sources;
    expect(all.map((s: { title: string }) => s.title)).toEqual(["A1", "B1"]);
    expect(all[1]).toMatchObject({ notebookId: b, notebookTitle: "Beta", url: "https://example.com/b" });

    const others = (await (await listLibrary(request(`/api/sources?exclude=${a}`))).json()).sources;
    expect(others.map((s: { title: string }) => s.title)).toEqual(["B1"]);
  });

  it("returns an empty list when there are no sources", async () => {
    expect(await (await listLibrary(request("/api/sources"))).json()).toEqual({ sources: [] });
  });
});

describe("/api/sources/[id]", () => {
  it("returns 404 for an unknown source", async () => {
    const res = await getSource(request("/x"), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns the source text, and the cited passage when part is given", async () => {
    const nb = seedNotebook();
    const id = seedSource(nb, { title: "Doc", chunks: ["first passage", "second passage"] });

    const plain = await (await getSource(request(`/x`), idCtx(id))).json();
    expect(plain).toMatchObject({ id, title: "Doc", text: "first passage\n\nsecond passage" });
    expect(plain).not.toHaveProperty("passage");

    const part2 = await (await getSource(request(`/x?part=2`), idCtx(id))).json();
    expect(part2.passage).toBe("second passage");
    const beyond = await (await getSource(request(`/x?part=9`), idCtx(id))).json();
    expect(beyond.passage).toBeNull();
    for (const part of ["0", "-1", "abc", "1.5"]) {
      expect(await (await getSource(request(`/x?part=${part}`), idCtx(id))).json()).not.toHaveProperty("passage");
    }
  });

  it("deletes a source and its chunks, and tolerates an unknown id", async () => {
    const nb = seedNotebook();
    const id = seedSource(nb);
    expect((await deleteSource(request("/x", "DELETE"), idCtx(id))).status).toBe(200);
    expect(count("sources", "id = ?", id)).toBe(0);
    expect(count("chunks", "source_id = ?", id)).toBe(0);
    expect((await deleteSource(request("/x", "DELETE"), idCtx("missing"))).status).toBe(200);
  });

  describe("deciding on a detected change", () => {
    const decide = (id: string, body: unknown) => decideSource(request("/x", "POST", body), idCtx(id));

    it("returns 404 for an unknown source", async () => {
      expect((await decide("missing", { action: "apply" })).status).toBe(404);
    });

    it("returns 409 when nothing is pending", async () => {
      const id = seedSource(seedNotebook());
      const res = await decide(id, { action: "apply" });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "This source has no pending change." });
    });

    it("rejects an unknown action and leaves the pending change alone", async () => {
      const id = seedSource(seedNotebook(), { pending: { text: "new text" } });
      for (const body of [{ action: "merge" }, {}]) {
        const res = await decide(id, body);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'action must be "apply" or "dismiss".' });
      }
      expect(count("sources", "id = ? AND pending_text IS NOT NULL", id)).toBe(1);
    });

    it("dismisses a change while keeping the old text and recording the new baseline", async () => {
      const id = seedSource(seedNotebook(), { chunks: ["old"], pending: { text: "new", hash: "h2" } });
      const res = await decide(id, { action: "dismiss" });
      expect(await res.json()).toEqual({ id, applied: false });
      const row = db
        .prepare("SELECT text, pending_text, content_hash FROM sources WHERE id = ?")
        .get(id) as unknown as { text: string; pending_text: string | null; content_hash: string };
      expect(row).toEqual({ text: "old", pending_text: null, content_hash: "h2" });
    });

    it("applies a change by re-indexing with the new title and text", async () => {
      const id = seedSource(seedNotebook(), { title: "Old", chunks: ["old"], pending: { text: "new body", title: "New" } });
      const res = await decide(id, { action: "apply" });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id, applied: true, chunks: 1 });
      const row = db.prepare("SELECT title, text, pending_text FROM sources WHERE id = ?").get(id) as unknown as {
        title: string;
        text: string;
        pending_text: string | null;
      };
      expect(row).toEqual({ title: "New", text: "new body", pending_text: null });
      expect(count("chunks", "source_id = ? AND text = 'new body' AND embedding IS NOT NULL", id)).toBe(1);
    });

    it("applies a change without embeddings and warns when the embedder fails", async () => {
      const id = seedSource(seedNotebook(), { pending: { text: "new body" } });
      mocks.embed.mockRejectedValue(new Error("no embedding deployment"));
      const body = await (await decide(id, { action: "apply" })).json();
      expect(body.applied).toBe(true);
      expect(body.warning).toContain("no embedding deployment");
      expect(count("chunks", "source_id = ? AND embedding IS NULL", id)).toBe(1);
    });
  });
});

describe("/api/notes/[id]", () => {
  it("returns 404 for an unknown note", async () => {
    for (const res of [
      await getNote(request("/x"), idCtx("missing")),
      await patchNote(request("/x", "PATCH", { title: "t" }), idCtx("missing")),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Note not found" });
    }
  });

  it("returns, edits and deletes a note", async () => {
    const note = createNote({ notebookId: seedNotebook(), content: "Original body" });
    expect((await (await getNote(request("/x"), idCtx(note.id))).json()).note.title).toBe("Original body");

    const patched = await (
      await patchNote(request("/x", "PATCH", { title: " Renamed ", content: "New body" }), idCtx(note.id))
    ).json();
    expect(patched.note).toMatchObject({ title: "Renamed", content: "New body" });

    const keepTitle = await (await patchNote(request("/x", "PATCH", { title: "   " }), idCtx(note.id))).json();
    expect(keepTitle.note.title).toBe("Renamed");

    expect((await deleteNote(request("/x", "DELETE"), idCtx(note.id))).status).toBe(200);
    expect((await getNote(request("/x"), idCtx(note.id))).status).toBe(404);
    expect((await deleteNote(request("/x", "DELETE"), idCtx(note.id))).status).toBe(200);
  });

  it("reports a body that is not JSON as an error", async () => {
    const note = createNote({ notebookId: seedNotebook(), content: "x" });
    expect((await patchNote(request("/x", "PATCH", "{nope"), idCtx(note.id))).status).toBe(500);
  });
});

describe("/api/sessions/[id]", () => {
  it("returns 404 for an unknown chat", async () => {
    for (const res of [
      await getSession(request("/x"), idCtx("missing")),
      await patchSession(request("/x", "PATCH", { title: "t" }), idCtx("missing")),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Chat not found" });
    }
  });

  it("returns a chat with its messages in order", async () => {
    const session = createSession(seedNotebook());
    const insert = db.prepare(
      "INSERT INTO messages (id, notebook_id, session_id, role, content, citations, created_at) VALUES (?,?,?,?,?,?,?)",
    );
    insert.run("m2", session.notebookId, session.id, "assistant", "answer", '[{"n":1}]', 2);
    insert.run("m1", session.notebookId, session.id, "user", "question", null, 1);

    const body = await (await getSession(request("/x"), idCtx(session.id))).json();
    expect(body.session.id).toBe(session.id);
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2"]);
    expect(body.messages[1].citations).toEqual([{ n: 1 }]);
  });

  it("renames a chat, trimming and capping the title", async () => {
    const session = createSession(seedNotebook());
    const res = await patchSession(request("/x", "PATCH", { title: `  ${"t".repeat(200)}  ` }), idCtx(session.id));
    expect((await res.json()).session.title).toHaveLength(120);
  });

  it.each([["missing", {}], ["blank", { title: "   " }]])("rejects a %s title", async (_name, body) => {
    const session = createSession(seedNotebook(), "Keep");
    const res = await patchSession(request("/x", "PATCH", body), idCtx(session.id));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Title is required" });
    expect((await (await getSession(request("/x"), idCtx(session.id))).json()).session.title).toBe("Keep");
  });

  it("deletes a chat with its messages", async () => {
    const session = createSession(seedNotebook());
    db.prepare(
      "INSERT INTO messages (id, notebook_id, session_id, role, content, created_at) VALUES ('m', ?, ?, 'user', 'q', 1)",
    ).run(session.notebookId, session.id);
    expect((await deleteSession(request("/x", "DELETE"), idCtx(session.id))).status).toBe(200);
    expect(count("chat_sessions", "id = ?", session.id)).toBe(0);
    expect(count("messages", "session_id = ?", session.id)).toBe(0);
  });
});

describe("/api/artifacts/[id]", () => {
  it("returns 404 for an unknown artifact", async () => {
    const res = await getArtifact(request("/x"), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns an artifact with its parsed body and notices stalled builds", async () => {
    const nb = seedNotebook();
    const id = seedArtifact(nb, "faq", { title: "FAQ", items: [{ q: "q", a: "a" }] }, "My FAQ");
    const body = await (await getArtifact(request("/x"), idCtx(id))).json();
    expect(body).toMatchObject({
      id,
      notebookId: nb,
      type: "faq",
      title: "My FAQ",
      content: { title: "FAQ", items: [{ q: "q", a: "a" }] },
    });
    expect(mocks.reconcileStalledVideo).toHaveBeenCalledWith(id);
    expect(mocks.resumeStalledTraining).toHaveBeenCalledWith(id);
    expect(mocks.reconcileStalledPodcast).toHaveBeenCalledWith(id);
  });

  it("deletes an artifact and the files its type owns", async () => {
    const nb = seedNotebook();
    const cases: [string, ReturnType<typeof vi.fn>][] = [
      ["podcast", mocks.removeAudio],
      ["infographic", mocks.removeImage],
      ["video", mocks.removeVideo],
      ["motion", mocks.removeVideo],
    ];
    for (const [type, remove] of cases) {
      const id = seedArtifact(nb, type);
      expect((await deleteArtifact(request("/x", "DELETE"), idCtx(id))).status).toBe(200);
      expect(remove).toHaveBeenCalledWith(id);
      expect(count("artifacts", "id = ?", id)).toBe(0);
    }

    const training = seedArtifact(nb, "training", '{"sections":[]}');
    await deleteArtifact(request("/x", "DELETE"), idCtx(training));
    expect(mocks.removeVideo).toHaveBeenCalledWith(training);
    expect(mocks.forgetTraining).toHaveBeenCalledExactlyOnceWith('{"sections":[]}');
  });

  it("does not touch files when deleting a text artifact or an unknown id", async () => {
    const id = seedArtifact(seedNotebook(), "quiz");
    expect((await deleteArtifact(request("/x", "DELETE"), idCtx(id))).status).toBe(200);
    expect((await deleteArtifact(request("/x", "DELETE"), idCtx("missing"))).status).toBe(200);
    for (const m of [mocks.removeAudio, mocks.removeImage, mocks.removeVideo, mocks.forgetTraining]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});
