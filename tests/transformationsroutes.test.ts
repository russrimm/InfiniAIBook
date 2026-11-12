import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as list, POST as create } from "@/app/api/transformations/route";
import { DELETE, GET as getOne, PATCH } from "@/app/api/transformations/[id]/route";
import { POST as apply } from "@/app/api/transformations/apply/route";
import { db } from "@/lib/db";
import { BUILTIN_TRANSFORMATIONS } from "@/lib/transformations";
import { count, idCtx, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({ chatText: vi.fn() }));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  chatText: mocks.chatText,
}));

beforeEach(() => {
  resetNotebooks();
  db.exec("DELETE FROM transformations");
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const make = async (body: unknown) => (await (await create(request("/api/transformations", "POST", body))).json()).transformation;

describe("/api/transformations", () => {
  it("lists the built-ins, then custom transformations by name", async () => {
    await make({ name: "Zebra", prompt: "z" });
    await make({ name: "Apple", prompt: "a" });
    const { transformations } = await (await list()).json();
    expect(transformations.slice(0, BUILTIN_TRANSFORMATIONS.length).every((t: { builtin: boolean }) => t.builtin)).toBe(true);
    expect(transformations.slice(BUILTIN_TRANSFORMATIONS.length).map((t: { name: string }) => t.name)).toEqual(["Apple", "Zebra"]);
  });

  it("creates a transformation with trimmed, capped fields", async () => {
    const res = await create(
      request("/api/transformations", "POST", { name: `  ${"n".repeat(100)} `, description: "  d  ", prompt: ` ${"p".repeat(9000)} ` }),
    );
    expect(res.status).toBe(201);
    const { transformation } = await res.json();
    expect(transformation.name).toHaveLength(80);
    expect(transformation.description).toBe("d");
    expect(transformation.prompt).toHaveLength(8000);
    expect(transformation.builtin).toBe(false);
  });

  it.each([
    ["no name", { prompt: "p" }],
    ["a blank name", { name: "  ", prompt: "p" }],
    ["no prompt", { name: "n" }],
    ["a blank prompt", { name: "n", prompt: " " }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await create(request("/api/transformations", "POST", body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Name and prompt are required." });
    expect(count("transformations")).toBe(0);
  });

  it("returns 500 for a body that is not JSON", async () => {
    expect((await create(request("/api/transformations", "POST", "{nope"))).status).toBe(500);
  });
});

describe("/api/transformations/[id]", () => {
  it("returns a built-in, including when its id arrives URL-encoded", async () => {
    for (const id of ["builtin:toc", "builtin%3Atoc"]) {
      const res = await getOne(request("/x"), idCtx(id));
      expect(res.status).toBe(200);
      expect((await res.json()).transformation).toMatchObject({ id: "builtin:toc", builtin: true });
    }
  });

  it("returns 404 for an unknown transformation", async () => {
    for (const res of [
      await getOne(request("/x"), idCtx("missing")),
      await PATCH(request("/x", "PATCH", { name: "n" }), idCtx("missing")),
    ]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
  });

  it("edits only the fields that are sent and ignores blank ones", async () => {
    const t = await make({ name: "Name", description: "Desc", prompt: "Prompt" });
    const res = await PATCH(request("/x", "PATCH", { name: "  ", description: "New desc", prompt: "New prompt" }), idCtx(t.id));
    expect((await res.json()).transformation).toMatchObject({ name: "Name", description: "New desc", prompt: "New prompt" });
  });

  it("refuses to edit or delete a built-in", async () => {
    const edit = await PATCH(request("/x", "PATCH", { name: "Hacked" }), idCtx("builtin:toc"));
    expect(edit.status).toBe(400);
    expect(await edit.json()).toEqual({ error: "Built-in transformations cannot be edited." });
    const del = await DELETE(request("/x", "DELETE"), idCtx("builtin:toc"));
    expect(del.status).toBe(400);
    expect(await del.json()).toEqual({ error: "Built-in transformations cannot be deleted." });
  });

  it("deletes a custom transformation and tolerates an unknown id", async () => {
    const t = await make({ name: "n", prompt: "p" });
    expect((await DELETE(request("/x", "DELETE"), idCtx(t.id))).status).toBe(200);
    expect(count("transformations")).toBe(0);
    expect((await DELETE(request("/x", "DELETE"), idCtx("missing"))).status).toBe(200);
  });
});

describe("POST /api/transformations/apply", () => {
  const run = (body: unknown, headers: Record<string, string> = {}) =>
    apply(request("/api/transformations/apply", "POST", body, headers));

  it("returns 404 for an unknown transformation or source", async () => {
    const sourceId = seedSource(seedNotebook());
    for (const body of [{}, { transformationId: "nope", sourceId }]) {
      const res = await run(body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Unknown transformation" });
    }
    for (const body of [{ transformationId: "builtin:toc" }, { transformationId: "builtin:toc", sourceId: "gone" }]) {
      const res = await run(body);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Source not found" });
    }
    expect(mocks.chatText).not.toHaveBeenCalled();
  });

  it("returns 400 when the source has no text", async () => {
    const sourceId = seedSource(seedNotebook(), { chunks: [] });
    const res = await run({ transformationId: "builtin:toc", sourceId });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That source has no text to work with." });
  });

  it("saves the result as an AI note on the source's notebook, keeping only cited passages", async () => {
    const notebookId = seedNotebook();
    const sourceId = seedSource(notebookId, { title: "Paper", chunks: ["First finding.", "Second finding."] });
    mocks.chatText.mockResolvedValue("## Summary\nA claim [1].");

    const res = await run({ transformationId: "builtin:dense-summary", sourceId });
    expect(res.status).toBe(201);
    const { note } = await res.json();
    expect(note).toMatchObject({
      notebookId,
      title: "Dense summary: Paper",
      content: "## Summary\nA claim [1].",
      kind: "ai",
      sourceId,
    });
    expect(note.citations).toEqual([expect.objectContaining({ n: 1, sourceId, sourceTitle: "Paper" })]);

    const [system, user] = mocks.chatText.mock.calls[0][0] as { content: string }[];
    expect(system.content).toContain("Write a dense summary of the source.");
    expect(system.content).toContain("First finding.");
    expect(user.content).toBe('Apply "Dense summary" to "Paper".');
  });

  it("applies a custom transformation", async () => {
    const t = await make({ name: "Mine", prompt: "Do my thing" });
    const sourceId = seedSource(seedNotebook(), { title: "Doc" });
    mocks.chatText.mockResolvedValue("done");
    const res = await run({ transformationId: t.id, sourceId });
    expect((await res.json()).note.title).toBe("Mine: Doc");
    expect((mocks.chatText.mock.calls[0][0] as { content: string }[])[0].content).toContain("Do my thing");
  });

  it("reports a model failure and saves no note", async () => {
    const sourceId = seedSource(seedNotebook());
    mocks.chatText.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));
    const res = await run({ transformationId: "builtin:toc", sourceId });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "auth" });
    expect(count("notes")).toBe(0);
  });

  it("streams status events and the saved note when the client asks for NDJSON", async () => {
    const sourceId = seedSource(seedNotebook());
    mocks.chatText.mockResolvedValue("ok");
    const res = await run({ transformationId: "builtin:toc", sourceId }, { accept: "application/x-ndjson" });
    const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lines.map((l) => l.event)).toEqual(expect.arrayContaining(["status", "result"]));
    expect(lines.at(-1)).toMatchObject({ event: "result", status: 201, body: { note: { kind: "ai" } } });
  });
});
