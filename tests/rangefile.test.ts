import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { serveRangedFile } from "@/lib/rangefile";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rangefile-test-"));
const file = path.join(dir, "audio.bin");
fs.writeFileSync(file, Buffer.from("0123456789"));

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const get = (range?: string) =>
  serveRangedFile(
    new Request("http://localhost/f", { headers: range ? { range } : {} }),
    file,
    "audio/mpeg"
  );
const body = async (res: Response) => Buffer.from(await res.arrayBuffer()).toString();

describe("serveRangedFile", () => {
  it("returns 404 for a missing file", async () => {
    const res = serveRangedFile(new Request("http://localhost/f"), path.join(dir, "nope"), "audio/mpeg");
    expect(res.status).toBe(404);
  });

  it("serves the whole file when no range is requested", async () => {
    const res = get();
    expect(res.status).toBe(200);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe("10");
    expect(await body(res)).toBe("0123456789");
  });

  it("serves a closed byte range as 206", async () => {
    const res = get("bytes=2-5");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("content-length")).toBe("4");
    expect(await body(res)).toBe("2345");
  });

  it("serves an open-ended range to the end of the file", async () => {
    const res = get("bytes=7-");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(await body(res)).toBe("789");
  });

  it("clamps an end past the file size", async () => {
    const res = get("bytes=8-999");
    expect(res.headers.get("content-range")).toBe("bytes 8-9/10");
    expect(await body(res)).toBe("89");
  });

  it("rejects a range that starts past the end or runs backwards", () => {
    for (const range of ["bytes=10-", "bytes=50-60", "bytes=5-2"]) {
      const res = get(range);
      expect(res.status, range).toBe(416);
      expect(res.headers.get("content-range")).toBe("bytes */10");
    }
  });
});
