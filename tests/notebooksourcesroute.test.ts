import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/notebooks/[id]/sources/route";
import { db } from "@/lib/db";
import { LearnError } from "@/lib/learn";
import { MAX_TITLE_CHARS, MAX_UPLOAD_BYTES } from "@/lib/limits";
import { count, idCtx, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  embed: vi.fn(),
  chatText: vi.fn(),
  extractFromUrl: vi.fn(),
  fetchYouTubeTranscript: vi.fn(),
  fetchLearnPage: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  embed: mocks.embed,
  chatText: mocks.chatText,
}));
vi.mock("@/lib/ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingest")>()),
  extractFromUrl: mocks.extractFromUrl,
}));
vi.mock("@/lib/youtube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/youtube")>()),
  fetchYouTubeTranscript: mocks.fetchYouTubeTranscript,
}));
vi.mock("@/lib/learn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learn")>()),
  fetchLearnPage: mocks.fetchLearnPage,
}));

const LEARN = "https://learn.microsoft.com/en-us/azure/ai-services/overview";

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3]));
  mocks.chatText.mockResolvedValue("A short summary.");
});

const add = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(request(`/api/notebooks/${id}/sources`, "POST", body, headers), idCtx(id));

const multipart = (id: string, files: File[]) => {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return POST(new Request(`http://localhost/api/notebooks/${id}/sources`, { method: "POST", body: form }), idCtx(id));
};

const title = (id: string) =>
  (db.prepare("SELECT title FROM notebooks WHERE id = ?").get(id) as unknown as { title: string }).title;

describe("POST /api/notebooks/[id]/sources", () => {
  it("returns 404 for an unknown notebook", async () => {
    const res = await add("missing", { text: "hello" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Notebook not found" });
  });

  it("refuses an upload whose declared size is over the limit before reading it", async () => {
    const id = seedNotebook();
    const res = await add(id, { text: "hello" }, { "content-length": String(MAX_UPLOAD_BYTES + 1024 * 1024) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too_large" });
    expect(count("sources")).toBe(0);
  });

  it("returns 400 when the request names nothing to add", async () => {
    const id = seedNotebook();
    const res = await add(id, {});
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Nothing was added." });
  });

  it("returns 500 for a body that is not JSON", async () => {
    const id = seedNotebook();
    const res = await add(id, "{nope");
    expect(res.status).toBe(500);
  });

  it("adds pasted text with embedded chunks, names the notebook, and schedules a summary", async () => {
    const id = seedNotebook("Untitled notebook");
    const res = await add(id, { text: "Solar panels convert sunlight into electricity.", title: "Solar.md" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toEqual([expect.objectContaining({ title: "Solar.md", kind: "text", chunks: 1 })]);
    expect(body.errors).toEqual([]);
    expect(body.warnings).toEqual([]);
    expect(title(id)).toBe("Solar");
    expect(count("chunks", "notebook_id = ? AND embedding IS NOT NULL AND embed_dims = 3", id)).toBe(1);

    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.after.mock.calls[0][0]();
    const row = db.prepare("SELECT summary FROM sources WHERE id = ?").get(body.added[0].id) as unknown as {
      summary: string;
    };
    expect(row.summary).toBe("A short summary.");
  });

  it("keeps the source when the summary call fails", async () => {
    const id = seedNotebook();
    mocks.chatText.mockRejectedValue(new Error("model down"));
    const body = await (await add(id, { text: "Some text." })).json();
    await mocks.after.mock.calls[0][0]();
    const row = db.prepare("SELECT summary FROM sources WHERE id = ?").get(body.added[0].id) as unknown as {
      summary: string | null;
    };
    expect(row.summary).toBeNull();
  });

  it("does not rename a notebook that already has a title or sources", async () => {
    const named = seedNotebook("My title");
    await add(named, { text: "text one", title: "First" });
    expect(title(named)).toBe("My title");

    const untitled = seedNotebook("Untitled notebook");
    seedSource(untitled);
    await add(untitled, { text: "text two", title: "Second" });
    expect(title(untitled)).toBe("Untitled notebook");
  });

  it("marks pasted notes and slides with their kind and defaults anything else to text", async () => {
    const id = seedNotebook();
    const note = await (await add(id, { text: "from a note", kind: "note" })).json();
    const odd = await (await add(id, { text: "other", kind: "bogus" })).json();
    expect(note.added[0].kind).toBe("note");
    expect(odd.added[0].kind).toBe("text");
    expect(odd.added[0].title).toBe("Pasted text");
  });

  it("truncates very long titles", async () => {
    const id = seedNotebook();
    const body = await (await add(id, { text: "text", title: "T".repeat(MAX_TITLE_CHARS + 50) })).json();
    expect(body.added[0].title).toHaveLength(MAX_TITLE_CHARS);
  });

  it("keeps keyword search working when embeddings are unavailable and warns", async () => {
    const id = seedNotebook();
    mocks.embed.mockRejectedValue(new Error("embedding deployment missing"));
    const res = await add(id, { text: "Plain text body." });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.added).toHaveLength(1);
    expect(body.warnings).toEqual([expect.stringContaining("Semantic search is disabled")]);
    expect(count("chunks", "notebook_id = ? AND embedding IS NULL", id)).toBe(1);
  });

  it("rejects text with no readable content", async () => {
    const id = seedNotebook();
    const res = await add(id, { text: "   ", title: "Blank" });
    expect(res.status).toBe(400);
    expect(count("sources")).toBe(0);
  });

  it("fetches a web page by URL", async () => {
    const id = seedNotebook();
    mocks.extractFromUrl.mockResolvedValue({ title: "Page title", text: "Page body", kind: "html" });
    const body = await (await add(id, { url: "https://example.com/post" })).json();
    expect(mocks.extractFromUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/post");
    expect(body.added[0]).toMatchObject({ title: "Page title", kind: "url" });
    const row = db.prepare("SELECT url FROM sources WHERE id = ?").get(body.added[0].id) as unknown as { url: string };
    expect(row.url).toBe("https://example.com/post");
  });

  it("keeps the audio kind for a linked recording", async () => {
    const id = seedNotebook();
    mocks.extractFromUrl.mockResolvedValue({ title: "Talk", text: "Transcript", kind: "audio" });
    const body = await (await add(id, { url: "https://example.com/talk.mp3" })).json();
    expect(body.added[0].kind).toBe("audio");
  });

  it("returns the fetch error when a URL cannot be read", async () => {
    const id = seedNotebook();
    mocks.extractFromUrl.mockRejectedValue(new Error("That address is not allowed."));
    const res = await add(id, { url: "http://127.0.0.1/admin" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "That address is not allowed." });
  });

  it("imports a YouTube transcript and passes its warning on", async () => {
    const id = seedNotebook();
    mocks.fetchYouTubeTranscript.mockResolvedValue({
      title: "Video",
      text: "Transcript text",
      kind: "youtube",
      warning: "Captions were auto-generated.",
    });
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const body = await (await add(id, { url })).json();
    expect(mocks.fetchYouTubeTranscript).toHaveBeenCalledExactlyOnceWith(url);
    expect(mocks.extractFromUrl).not.toHaveBeenCalled();
    expect(body.added[0]).toMatchObject({ title: "Video", kind: "youtube" });
    expect(body.warnings).toEqual(["Captions were auto-generated."]);
  });

  describe("Microsoft Learn pages", () => {
    it("rejects a URL that is not a documentation page", async () => {
      const id = seedNotebook();
      for (const learnUrl of ["https://example.com/doc", 42]) {
        const res = await add(id, { learnUrl });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/Microsoft Learn/);
      }
      expect(mocks.fetchLearnPage).not.toHaveBeenCalled();
    });

    it("imports a page once and refuses it again, ignoring the query", async () => {
      const id = seedNotebook();
      mocks.fetchLearnPage.mockImplementation(async (url: string) => ({
        title: "AI services overview",
        url,
        text: "Overview of services.",
      }));
      const first = await add(id, { learnUrl: `${LEARN}#top` });
      expect(first.status).toBe(200);
      expect((await first.json()).added[0]).toMatchObject({ title: "AI services overview", kind: "url" });
      expect(mocks.fetchLearnPage).toHaveBeenCalledExactlyOnceWith(LEARN);

      const again = await add(id, { learnUrl: `${LEARN}?view=foo` });
      expect(again.status).toBe(400);
      expect(await again.json()).toEqual({ error: "That Microsoft Learn page is already in this notebook." });
      expect(count("sources", "notebook_id = ?", id)).toBe(1);
    });

    it("reports a failed page fetch", async () => {
      const id = seedNotebook();
      mocks.fetchLearnPage.mockRejectedValue(new LearnError("Microsoft Learn is unreachable."));
      const res = await add(id, { learnUrl: LEARN });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Microsoft Learn is unreachable." });
    });
  });

  describe("reusing a source from another notebook", () => {
    it("copies text, summary and embeddings without calling any model", async () => {
      const from = seedNotebook("Origin");
      const id = seedNotebook();
      const src = seedSource(from, { title: "Shared", chunks: ["one", "two"], embedding: [1, 0], embedModel: "m" });
      db.prepare("UPDATE sources SET summary = 'S' WHERE id = ?").run(src);

      const res = await add(id, { copyFrom: src });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added[0]).toMatchObject({ title: "Shared", chunks: 2 });
      expect(count("chunks", "notebook_id = ? AND embedding IS NOT NULL AND embed_model = 'm'", id)).toBe(2);
      const copy = db.prepare("SELECT summary FROM sources WHERE id = ?").get(body.added[0].id) as unknown as {
        summary: string;
      };
      expect(copy.summary).toBe("S");
      expect(mocks.embed).not.toHaveBeenCalled();
      expect(mocks.chatText).not.toHaveBeenCalled();
      expect(count("sources", "notebook_id = ?", from)).toBe(1);
    });

    it("refuses a source that is already in the notebook", async () => {
      const id = seedNotebook();
      const src = seedSource(id, { title: "Mine" });
      const res = await add(id, { copyFrom: src });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: '"Mine" is already in this notebook.' });
    });

    it("refuses a source that no longer exists", async () => {
      const id = seedNotebook();
      const res = await add(id, { copyFrom: "gone" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "That source no longer exists." });
    });
  });

  describe("file uploads", () => {
    it("adds each uploaded text file as a source", async () => {
      const id = seedNotebook("Untitled notebook");
      const res = await multipart(id, [
        new File(["First file body"], "first.txt", { type: "text/plain" }),
        new File(["Second file body"], "second.md", { type: "text/markdown" }),
      ]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added.map((a: { title: string }) => a.title)).toEqual(["first.txt", "second.md"]);
      expect(body.added.map((a: { kind: string }) => a.kind)).toEqual(["txt", "md"]);
      expect(title(id)).toBe("first");
    });

    it("reports an empty file but keeps the others", async () => {
      const id = seedNotebook();
      const res = await multipart(id, [new File([""], "empty.txt"), new File(["real content"], "real.txt")]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toHaveLength(1);
      expect(body.errors).toEqual(['empty.txt: No readable text found in "empty.txt".']);
    });

    it("returns 400 when every file fails", async () => {
      const id = seedNotebook();
      const res = await multipart(id, [new File([""], "empty.txt")]);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("empty.txt");
    });

    it("returns 400 for a multipart request with no files", async () => {
      const id = seedNotebook();
      const res = await multipart(id, []);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Nothing was added." });
    });

    it("unpacks a zip into one source per supported file, naming the notebook after the archive", async () => {
      const id = seedNotebook("Untitled notebook");
      const zip = new JSZip();
      zip.file("a.txt", "Alpha file");
      zip.file("b.md", "Beta file");
      zip.file("image.bin", new Uint8Array([0, 1, 2, 3]));
      const bytes = await zip.generateAsync({ type: "arraybuffer" });

      const res = await multipart(id, [new File([bytes], "bundle.zip", { type: "application/zip" })]);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.added).toHaveLength(2);
      expect(body.warnings.join(" ")).toMatch(/Skipped 1 unsupported file/);
      expect(title(id)).toBe("bundle");
    });

    it("returns 400 for a zip with nothing supported in it", async () => {
      const id = seedNotebook();
      const zip = new JSZip();
      zip.file("data.bin", new Uint8Array([1, 2, 3]));
      const bytes = await zip.generateAsync({ type: "arraybuffer" });
      const res = await multipart(id, [new File([bytes], "junk.zip", { type: "application/zip" })]);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/No supported files found in "junk.zip"/);
    });
  });
});
