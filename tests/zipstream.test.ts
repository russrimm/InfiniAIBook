import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import {
  ZipError,
  extractZipEntry,
  readZipDirectory,
  safeEntryParts,
  writeZip,
  type ZipSource,
} from "@/lib/zipstream";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function build(name: string, sources: ZipSource[], opts?: { zip64At?: number }): Promise<string> {
  const file = path.join(tmp, name);
  const chunks: Buffer[] = [];
  for await (const c of writeZip(sources, opts)) chunks.push(c);
  fs.writeFileSync(file, Buffer.concat(chunks));
  return file;
}

const buf = (name: string, text: string, store = false): ZipSource => ({
  name,
  size: Buffer.byteLength(text),
  store,
  open: () => Buffer.from(text),
});

async function read(file: string, name: string): Promise<string> {
  const entry = readZipDirectory(file).find((e) => e.name === name)!;
  const dest = path.join(tmp, `out-${Math.random().toString(36).slice(2)}`);
  await extractZipEntry(file, entry, dest);
  return fs.readFileSync(dest, "utf8");
}

describe("zip writer and reader", () => {
  it("round-trips buffers and streams, deflated and stored", async () => {
    const big = "InfiniAIBook ".repeat(50_000);
    const file = await build("a.zip", [
      buf("small.txt", "hello"),
      buf("stored.bin", "stored bytes", true),
      { name: "dir/big.txt", size: big.length, open: () => Readable.from([Buffer.from(big)]) },
      { name: "dir/big-stored.txt", size: big.length, store: true, open: () => Readable.from([Buffer.from(big)]) },
      buf("empty.txt", ""),
    ]);
    const names = readZipDirectory(file).map((e) => e.name);
    expect(names).toEqual(["small.txt", "stored.bin", "dir/big.txt", "dir/big-stored.txt", "empty.txt"]);
    expect(await read(file, "small.txt")).toBe("hello");
    expect(await read(file, "stored.bin")).toBe("stored bytes");
    expect(await read(file, "dir/big.txt")).toBe(big);
    expect(await read(file, "dir/big-stored.txt")).toBe(big);
    expect(await read(file, "empty.txt")).toBe("");
    expect(fs.statSync(file).size).toBeLessThan(big.length * 2 - 100_000); // the deflated copy is tiny
  });

  it("writes and reads ZIP64 entries", async () => {
    const file = await build("z64.zip", [buf("one.txt", "first body"), buf("two.txt", "second body", true)], { zip64At: 1 });
    expect(await read(file, "one.txt")).toBe("first body");
    expect(await read(file, "two.txt")).toBe("second body");
  });

  it("handles more than 65,535 entries with a ZIP64 directory", async () => {
    const many: ZipSource[] = Array.from({ length: 65_600 }, (_, i) => buf(`f/${i}.txt`, "x", true));
    const file = await build("many.zip", many);
    const entries = readZipDirectory(file);
    expect(entries).toHaveLength(65_600);
    expect(await read(file, "f/65599.txt")).toBe("x");
  });

  it("refuses a file that is not a ZIP, or is cut short", async () => {
    const junk = path.join(tmp, "junk.zip");
    fs.writeFileSync(junk, "this is not a zip archive at all, just text");
    expect(() => readZipDirectory(junk)).toThrow(ZipError);
    const good = await build("cut.zip", [buf("a.txt", "a".repeat(1000))]);
    const cut = path.join(tmp, "cut-short.zip");
    fs.writeFileSync(cut, fs.readFileSync(good).subarray(0, 80));
    expect(() => readZipDirectory(cut)).toThrow(ZipError);
  });

  it("detects a flipped byte through the CRC check and removes the partial file", async () => {
    const file = await build("flip.zip", [buf("a.txt", "important data here", true)]);
    const bytes = fs.readFileSync(file);
    const at = bytes.indexOf("important");
    bytes[at + 2] ^= 0xff;
    fs.writeFileSync(file, bytes);
    const entry = readZipDirectory(file)[0];
    const dest = path.join(tmp, "flip-out");
    await expect(extractZipEntry(file, entry, dest)).rejects.toThrow(/integrity/);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("stops inflating at the size the directory declares (decompression bomb)", async () => {
    const file = await build("bomb.zip", [buf("zeros.bin", "\0".repeat(5_000_000))]);
    const bytes = fs.readFileSync(file);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1000, central + 24); // declared uncompressed size
    fs.writeFileSync(file, bytes);
    const entry = readZipDirectory(file)[0];
    await expect(extractZipEntry(file, entry, path.join(tmp, "bomb-out"))).rejects.toThrow(/larger than the archive says/);
  });

  it("never overwrites an existing file", async () => {
    const file = await build("exist.zip", [buf("a.txt", "new")]);
    const dest = path.join(tmp, "exists-already");
    fs.writeFileSync(dest, "old");
    await expect(extractZipEntry(file, readZipDirectory(file)[0], dest)).rejects.toThrow();
    expect(fs.readFileSync(dest, "utf8")).toBe("old");
  });
});

describe("safeEntryParts (zip-slip)", () => {
  it.each([
    "../evil.txt",
    "data/../../evil.txt",
    "data/./x",
    "/etc/passwd",
    "C:/Windows/x",
    "C:\\Windows\\x",
    "data\\..\\..\\evil",
    "data/a:stream",
    "data//x",
    "",
    "data/x\u0000.txt",
    "data/trailing.",
    "data/con<x>",
  ])("refuses %j", (name) => {
    expect(() => safeEntryParts(name)).toThrow(ZipError);
  });

  it("accepts ordinary nested names and directory entries", () => {
    expect(safeEntryParts("data/video/abc-work/frame 01.png")).toEqual(["data", "video", "abc-work", "frame 01.png"]);
    expect(safeEntryParts("data/video/")).toEqual(["data", "video"]);
  });
});
