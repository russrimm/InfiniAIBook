import fs from "node:fs";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as listNotebooks, POST as createNotebook } from "@/app/api/notebooks/route";
import { DELETE, GET, PATCH } from "@/app/api/notebooks/[id]/route";
import { GET as exportNotebook } from "@/app/api/notebooks/[id]/export/route";
import { POST as createNote } from "@/app/api/notebooks/[id]/notes/route";
import { POST as importNotebook } from "@/app/api/notebooks/import/route";
import { db } from "@/lib/db";
import { PACK_FORMAT, PACK_VERSION } from "@/lib/notebookpack";
import { count, idCtx, request, resetNotebooks, seedArtifact, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  removeAudio: vi.fn(),
  removeImage: vi.fn(),
  removeVideo: vi.fn(),
  forgetTraining: vi.fn(),
  reconcileStalledVideos: vi.fn(),
  resumeStalledTrainings: vi.fn(),
  reconcileStalledPodcasts: vi.fn(),
}));

vi.mock("@/lib/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/paths")>()),
  removeAudio: mocks.removeAudio,
  removeImage: mocks.removeImage,
  removeVideo: mocks.removeVideo,
}));
vi.mock("@/lib/videobuild", () => ({ reconcileStalledVideos: mocks.reconcileStalledVideos }));
vi.mock("@/lib/trainingbuild", () => ({
  forgetTraining: mocks.forgetTraining,
  resumeStalledTrainings: mocks.resumeStalledTrainings,
}));
vi.mock("@/lib/podcaststore", () => ({ reconcileStalledPodcasts: mocks.reconcileStalledPodcasts }));

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const upload = (file: File | string | null) => {
  const form = new FormData();
  if (file !== null) form.set("file", file);
  return new Request("http://localhost/api/notebooks/import", { method: "POST", body: form });
};

describe("/api/notebooks", () => {
  it("lists notebooks newest first with their source counts", async () => {
    const older = seedNotebook("Older");
    db.prepare("UPDATE notebooks SET created_at = 1 WHERE id = ?").run(older);
    const newer = seedNotebook("Newer");
    seedSource(newer);
    seedSource(newer);

    const res = await listNotebooks();
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { title: string }) => r.title)).toEqual(["Newer", "Older"]);
    expect(rows[0]).toMatchObject({ id: newer, sourceCount: 2, emoji: expect.any(String) });
    expect(rows[1].sourceCount).toBe(0);
  });

  it("creates a notebook with a trimmed title", async () => {
    const res = await createNotebook(request("/api/notebooks", "POST", { title: "  Research  " }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = db.prepare("SELECT title FROM notebooks WHERE id = ?").get(id) as unknown as { title: string };
    expect(row.title).toBe("Research");
  });

  it.each([["a blank title", { title: "   " }], ["no body", undefined], ["invalid JSON", "{nope"]])(
    "falls back to the default title for %s",
    async (_name, body) => {
      const res = await createNotebook(request("/api/notebooks", "POST", body));
      expect(res.status).toBe(201);
      const { id } = await res.json();
      const row = db.prepare("SELECT title FROM notebooks WHERE id = ?").get(id) as unknown as { title: string };
      expect(row.title).toBe("Untitled notebook");
    },
  );
});

describe("/api/notebooks/[id]", () => {
  it("returns 404 for an unknown notebook", async () => {
    const res = await GET(request("/api/notebooks/missing"), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(mocks.reconcileStalledVideos).not.toHaveBeenCalled();
  });

  it("returns the notebook with sources, artifacts without bodies, notes and sessions", async () => {
    const id = seedNotebook("Solar");
    const sourceId = seedSource(id, { title: "Panels", url: "https://example.com/p" });
    seedArtifact(id, "faq", { title: "FAQ", items: [{ q: "q", a: "a" }] }, "FAQ");
    const created = await createNote(request(`/api/notebooks/${id}/notes`, "POST", { content: "A thought" }), idCtx(id));
    expect(created.status).toBe(201);

    const res = await GET(request(`/api/notebooks/${id}`), idCtx(id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notebook).toMatchObject({ id, title: "Solar", liveLearn: false });
    expect(body.notebook.narration).toEqual({ instructions: "", replacements: [] });
    expect(body.sources).toEqual([
      expect.objectContaining({ id: sourceId, title: "Panels", url: "https://example.com/p" }),
    ]);
    expect(body.artifacts).toHaveLength(1);
    expect(body.artifacts[0]).not.toHaveProperty("content");
    expect(body.notes).toHaveLength(1);
    expect(body.messages).toEqual([]);
    expect(body.maxUploadBytes).toBeGreaterThan(0);
    expect(mocks.reconcileStalledVideos).toHaveBeenCalledWith(id);
    expect(mocks.resumeStalledTrainings).toHaveBeenCalledWith(id);
    expect(mocks.reconcileStalledPodcasts).toHaveBeenCalledWith(id);
  });

  it("renames a notebook and ignores a blank title", async () => {
    const id = seedNotebook("Before");
    const res = await PATCH(request(`/api/notebooks/${id}`, "PATCH", { title: " After " }), idCtx(id));
    expect(res.status).toBe(200);
    const title = () =>
      (db.prepare("SELECT title FROM notebooks WHERE id = ?").get(id) as unknown as { title: string }).title;
    expect(title()).toBe("After");

    await PATCH(request(`/api/notebooks/${id}`, "PATCH", { title: "   " }), idCtx(id));
    expect(title()).toBe("After");
  });

  it("saves and normalizes narration settings", async () => {
    const id = seedNotebook();
    const res = await PATCH(
      request(`/api/notebooks/${id}`, "PATCH", {
        narration: {
          instructions: "  Say it plainly  ",
          replacements: [{ from: "SQL", to: "sequel" }, { from: "sql", to: "dupe" }, { from: "", to: "x" }],
        },
      }),
      idCtx(id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      narration: { instructions: "Say it plainly", replacements: [{ from: "SQL", to: "sequel" }] },
    });
    const body = await (await GET(request(`/api/notebooks/${id}`), idCtx(id))).json();
    expect(body.notebook.narration.instructions).toBe("Say it plainly");
  });

  it("toggles live learn and validates its type", async () => {
    const id = seedNotebook();
    const on = await PATCH(request(`/api/notebooks/${id}`, "PATCH", { liveLearn: true }), idCtx(id));
    expect(on.status).toBe(200);
    const body = await (await GET(request(`/api/notebooks/${id}`), idCtx(id))).json();
    expect(body.notebook.liveLearn).toBe(true);

    const bad = await PATCH(request(`/api/notebooks/${id}`, "PATCH", { liveLearn: "yes" }), idCtx(id));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "liveLearn must be a boolean." });
  });

  it("returns 404 when toggling live learn on an unknown notebook", async () => {
    const res = await PATCH(request("/api/notebooks/missing", "PATCH", { liveLearn: true }), idCtx("missing"));
    expect(res.status).toBe(404);
  });

  it("reports an unreadable body as an error response", async () => {
    const id = seedNotebook();
    const res = await PATCH(request(`/api/notebooks/${id}`, "PATCH", "{nope"), idCtx(id));
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
  });

  it("deletes a notebook, its rows and the files its artifacts own", async () => {
    const id = seedNotebook();
    const other = seedNotebook("Keep me");
    seedSource(id);
    const podcast = seedArtifact(id, "podcast");
    const infographic = seedArtifact(id, "infographic");
    const video = seedArtifact(id, "video");
    const motion = seedArtifact(id, "motion");
    const training = seedArtifact(id, "training", '{"script":true}');
    seedArtifact(id, "quiz");
    seedArtifact(other, "quiz");

    const res = await DELETE(request(`/api/notebooks/${id}`, "DELETE"), idCtx(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(count("notebooks", "id = ?", id)).toBe(0);
    expect(count("sources", "notebook_id = ?", id)).toBe(0);
    expect(count("chunks", "notebook_id = ?", id)).toBe(0);
    expect(count("artifacts", "notebook_id = ?", id)).toBe(0);
    expect(count("artifacts", "notebook_id = ?", other)).toBe(1);
    expect(mocks.removeAudio).toHaveBeenCalledExactlyOnceWith(podcast);
    expect(mocks.removeImage).toHaveBeenCalledExactlyOnceWith(infographic);
    expect(mocks.removeVideo.mock.calls.map((c) => c[0]).sort()).toEqual([motion, training, video].sort());
    expect(mocks.forgetTraining).toHaveBeenCalledExactlyOnceWith('{"script":true}');
  });

  it("treats deleting an unknown notebook as a no-op success", async () => {
    const res = await DELETE(request("/api/notebooks/missing", "DELETE"), idCtx("missing"));
    expect(res.status).toBe(200);
  });
});

describe("/api/notebooks/[id]/export and /api/notebooks/import", () => {
  it("returns 404 when exporting an unknown notebook", async () => {
    const res = await exportNotebook(request("/api/notebooks/missing/export"), idCtx("missing"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("exports a zip that imports as a new notebook", async () => {
    const id = seedNotebook("Round trip");
    seedSource(id, { title: "Doc", chunks: ["Wind turbines convert motion to power."] });

    const exported = await exportNotebook(request(`/api/notebooks/${id}/export`), idCtx(id));
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toBe("application/zip");
    expect(exported.headers.get("content-disposition")).toMatch(/^attachment; filename="[^"]+"$/);
    expect(exported.headers.get("cache-control")).toBe("no-store");
    const bytes = await exported.arrayBuffer();

    const res = await importNotebook(upload(new File([bytes], "round-trip.zip", { type: "application/zip" })));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).not.toBe(id);
    expect(body.title).toBe("Round trip");
    expect(body.warning).toMatch(/Re-embed/);
    expect(count("sources", "notebook_id = ?", body.id)).toBe(1);
    expect(count("chunks", "notebook_id = ? AND embedding IS NULL", body.id)).toBeGreaterThan(0);
    // The original is untouched.
    expect(count("sources", "notebook_id = ?", id)).toBe(1);
  });

  it.each([["no file", null], ["a text field instead of a file", "not a file"]])(
    "rejects an import with %s",
    async (_name, file) => {
      const res = await importNotebook(upload(file));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Choose a notebook export (.zip)." });
    },
  );

  it("rejects an import over the size limit before reading it", async () => {
    const big = new File(["x"], "big.zip");
    Object.defineProperty(big, "size", { value: 200 * 1024 * 1024 + 1 });
    const form = { get: () => big } as unknown as FormData;
    const req = { formData: async () => form } as unknown as Request;
    const res = await importNotebook(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "That export is larger than 200 MB." });
  });

  it("reports a file that is not a notebook export", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const res = await importNotebook(upload(new File([bytes], "other.zip")));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "That file is not a notebook export." });
    expect(count("notebooks")).toBe(0);
  });

  it("reports an export from a different format version", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify({ format: PACK_FORMAT, version: PACK_VERSION + 1, notebook: {} }));
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const res = await importNotebook(upload(new File([bytes], "future.zip")));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/newer or different app/);
  });

  it("refuses archives with unsafe paths", async () => {
    const zip = new JSZip();
    zip.file("../evil.txt", "x");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const res = await importNotebook(upload(new File([bytes], "evil.zip")));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/unsafe file path/);
    expect(fs.existsSync("evil.txt")).toBe(false);
  });
});
