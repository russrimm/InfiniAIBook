import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as importNotebook } from "@/app/api/notebooks/import/route";
import { POST as addSources } from "@/app/api/notebooks/[id]/sources/route";
import { POST as uploadMusic } from "@/app/api/music/route";
import { POST as uploadWatermark } from "@/app/api/watermark/route";
import { readBody, BadRequestError } from "@/lib/badrequest";
import {
  BODY_CEILING_BYTES,
  BODY_OVERHEAD_BYTES,
  IMAGE_JSON_BODY_BYTES,
  JSON_BODY_BYTES,
  PayloadTooLargeError,
  declaredBodyProblem,
  limitBody,
  readJSONOr,
  readLimitedForm,
  readLimitedJSON,
} from "@/lib/bodylimits";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { MAX_MUSIC_BYTES } from "@/lib/musicchoice";
import { idCtx, resetNotebooks, seedNotebook } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  saveUpload: vi.fn(),
  listTracks: vi.fn(() => []),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/music", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/music")>()),
  saveUpload: mocks.saveUpload,
  listTracks: mocks.listTracks,
}));

const MIB = 1024 * 1024;

/** A request whose body arrives in 1 MiB chunks with no Content-Length, as a chunked upload would. */
function chunked(url: string, total: number, headers: Record<string, string> = {}, method = "POST") {
  const state = { sent: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.sent >= total) return controller.close();
      const n = Math.min(MIB, total - state.sent);
      state.sent += n;
      controller.enqueue(new Uint8Array(n));
    },
  });
  const req = new Request(url, { method, headers, body, duplex: "half" } as RequestInit);
  return { req, state };
}

beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("declaredBodyProblem", () => {
  const check = (method: string, path: string, headers: Record<string, string>) =>
    declaredBodyProblem(method, path, new Headers(headers));

  it("ignores requests that carry no body", () => {
    expect(check("GET", "/api/notebooks", { "content-length": String(1000 * MIB) })).toBeNull();
    expect(check("HEAD", "/api/notebooks", {})).toBeNull();
  });

  it("holds ordinary routes to the JSON limit", () => {
    expect(check("POST", "/api/chat", { "content-length": String(JSON_BODY_BYTES) })).toBeNull();
    expect(check("POST", "/api/chat", { "content-length": String(JSON_BODY_BYTES + 1) })).toMatchObject({
      status: 413,
      code: "too_large",
    });
  });

  it("lets the upload routes take files up to the ceiling, and no more", () => {
    for (const path of [
      "/api/notebooks/abc/sources",
      "/api/notebooks/import",
      "/api/music",
      "/api/bookends/abc/file",
      "/api/backup/restore",
    ]) {
      expect(check("POST", path, { "content-length": String(BODY_CEILING_BYTES) }), path).toBeNull();
      expect(check("POST", path, { "content-length": String(BODY_CEILING_BYTES + 1) }), path).toMatchObject({
        status: 413,
      });
    }
    expect(BODY_CEILING_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("holds the image routes to the image limit, for PUT as well as POST", () => {
    for (const [method, path] of [
      ["POST", "/api/watermark"],
      ["POST", "/api/training/t1/assets"],
      ["PUT", "/api/training/t1/raster"],
    ]) {
      expect(check(method, path, { "content-length": String(IMAGE_JSON_BODY_BYTES) })).toBeNull();
      expect(check(method, path, { "content-length": String(IMAGE_JSON_BODY_BYTES + 1) })).toMatchObject({ status: 413 });
    }
  });

  it("asks for a length when an ordinary route gets a chunked body", () => {
    const problem = check("POST", "/api/chat", { "transfer-encoding": "chunked" });
    expect(problem).toMatchObject({ status: 411, code: "length_required" });
    expect(problem?.error).toMatch(/Content-Length/);
    expect(check("POST", "/api/watermark", { "transfer-encoding": "chunked" })).toMatchObject({ status: 411 });
  });

  it("lets the file-upload routes take a chunked body, which they cap as it arrives", () => {
    expect(check("POST", "/api/notebooks/abc/sources", { "transfer-encoding": "chunked" })).toBeNull();
    expect(check("POST", "/api/music", { "transfer-encoding": "Chunked" })).toBeNull();
  });

  it("rejects a Content-Length that is not a size", () => {
    for (const bad of ["abc", "-5", "1e9", "12 34", ""]) {
      expect(check("POST", "/api/chat", { "content-length": bad }), bad).toMatchObject({ status: 400 });
    }
  });
});

describe("limitBody and the limited readers", () => {
  const url = "http://localhost/api/x";

  it("refuses at once when Content-Length is over the limit, without touching the body", () => {
    const { req, state } = chunked(url, 5 * MIB, { "content-length": String(5 * MIB) });
    expect(() => limitBody(req, MIB, "too big")).toThrow(PayloadTooLargeError);
    expect(state.sent).toBe(0);
  });

  it("stops reading a chunked body once it passes the limit", async () => {
    const { req, state } = chunked(url, 50 * MIB, { "content-type": "multipart/form-data; boundary=x" });
    await expect(readLimitedForm(req, 2 * MIB, "Too big.")).rejects.toThrow("Too big.");
    expect(state.sent).toBeLessThan(10 * MIB);
  });

  it("does not trust a Content-Length that undercounts", async () => {
    const { req, state } = chunked(url, 20 * MIB, { "content-length": "100" });
    await expect(readLimitedJSON(req, MIB)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(state.sent).toBeLessThan(10 * MIB);
  });

  it("passes a chunked body under the limit through intact", async () => {
    const payload = JSON.stringify({ hello: "world", pad: "x".repeat(3 * MIB) });
    const bytes = new TextEncoder().encode(payload);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += MIB) controller.enqueue(bytes.subarray(i, i + MIB));
        controller.close();
      },
    });
    const req = new Request(url, { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readLimitedJSON(req, 5 * MIB)).toMatchObject({ hello: "world" });
  });

  it("reads a normal multipart upload", async () => {
    const form = new FormData();
    form.set("file", new File(["hello audio"], "a.mp3", { type: "audio/mpeg" }));
    const read = await readLimitedForm(new Request(url, { method: "POST", body: form }), MIB);
    expect(await (read.get("file") as File).text()).toBe("hello audio");
  });

  it("readBody keeps its 400s and adds a 413", async () => {
    const post = (body: string) => new Request(url, { method: "POST", body });
    await expect(readBody(post("not json"))).rejects.toBeInstanceOf(BadRequestError);
    await expect(readBody(post('{"a":1}'))).resolves.toEqual({ a: 1 });
    const { req } = chunked(url, 12 * MIB);
    await expect(readBody(req)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("readJSONOr falls back on bad JSON but never swallows an oversized body", async () => {
    expect(await readJSONOr(new Request(url, { method: "POST", body: "nope" }), MIB, { fallback: true })).toEqual({
      fallback: true,
    });
    const { req } = chunked(url, 4 * MIB);
    await expect(readJSONOr(req, MIB, {})).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});

describe("upload routes", () => {
  it("source upload: refuses a declared size over the limit with 413", async () => {
    const id = seedNotebook();
    const { req } = chunked(`http://localhost/api/notebooks/${id}/sources`, MIB, {
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(MAX_UPLOAD_BYTES + BODY_OVERHEAD_BYTES + 1),
    });
    const res = await addSources(req, idCtx(id));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too_large", error: expect.stringContaining("MAX_UPLOAD_BYTES") });
  });

  it("source upload: stops a chunked body at the limit with 413", async () => {
    const id = seedNotebook();
    const { req, state } = chunked(`http://localhost/api/notebooks/${id}/sources`, MAX_UPLOAD_BYTES + 20 * MIB, {
      "content-type": "multipart/form-data; boundary=x",
    });
    const res = await addSources(req, idCtx(id));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too_large", error: expect.stringContaining("MAX_UPLOAD_BYTES") });
    expect(state.sent).toBeLessThan(MAX_UPLOAD_BYTES + 3 * MIB);
  });

  it("notebook import: stops a chunked body at 200 MB with 413", async () => {
    const { req, state } = chunked("http://localhost/api/notebooks/import", 230 * MIB, {
      "content-type": "multipart/form-data; boundary=x",
    });
    const res = await importNotebook(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "too_large", error: expect.stringContaining("200 MB") });
    expect(state.sent).toBeLessThan(205 * MIB);
  });

  it("music upload: refuses over-size by Content-Length and by streamed bytes", async () => {
    const declared = chunked("http://localhost/api/music", 30 * MIB, {
      "content-type": "multipart/form-data; boundary=x",
      "content-length": String(MAX_MUSIC_BYTES + BODY_OVERHEAD_BYTES + 1),
    });
    const a = await uploadMusic(declared.req);
    expect(a.status).toBe(413);
    expect(declared.state.sent).toBeLessThanOrEqual(2 * MIB);

    const streamed = chunked("http://localhost/api/music", MAX_MUSIC_BYTES + 10 * MIB, {
      "content-type": "multipart/form-data; boundary=x",
    });
    const b = await uploadMusic(streamed.req);
    expect(b.status).toBe(413);
    expect(await b.json()).toMatchObject({ error: expect.stringContaining("limited to 50 MB") });
    expect(streamed.state.sent).toBeLessThan(MAX_MUSIC_BYTES + 3 * MIB);
    expect(mocks.saveUpload).not.toHaveBeenCalled();
  });

  it("music upload: a normal track still goes through", async () => {
    mocks.saveUpload.mockReturnValue({ id: "t1", name: "a" });
    const form = new FormData();
    form.set("file", new File([new Uint8Array(2 * MIB)], "song.mp3", { type: "audio/mpeg" }));
    const res = await uploadMusic(new Request("http://localhost/api/music", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(mocks.saveUpload).toHaveBeenCalledOnce();
    expect(mocks.saveUpload.mock.calls[0][1]).toHaveLength(2 * MIB);
  });

  it("watermark upload: an oversized image body is a 413, not a silent empty one", async () => {
    const { req, state } = chunked("http://localhost/api/watermark", 40 * MIB, {
      "content-type": "application/json",
    });
    const res = await uploadWatermark(req);
    expect(res.status).toBe(413);
    expect(state.sent).toBeLessThan(10 * MIB);
  });
});
