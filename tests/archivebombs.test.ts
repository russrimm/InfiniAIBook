import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ transcribe: vi.fn() }));
vi.mock("@/lib/vision", async (orig) => ({
  ...(await orig<typeof import("@/lib/vision")>()),
  describeImage: vi.fn(),
}));

import { extractFromFile } from "@/lib/ingest";
import { importNotebookZip, NotebookImportError } from "@/lib/notebookpack";
import { pptxToText } from "@/lib/pptx";
import { assertOfficeWithinLimits } from "@/lib/officeguard";
import { ArchiveLimitError, assertZipEntryCount, countZipEntries } from "@/lib/zipread";

/** A ZIP listing `n` empty files. */
async function manyEntries(n: number): Promise<Buffer> {
  const zip = new JSZip();
  for (let i = 0; i < n; i++) zip.file(`f${i}.txt`, "");
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Rewrites the entry counts and directory size in the end record, as a hostile file could. */
function lieAboutCount(zip: Buffer): Buffer {
  const copy = Buffer.from(zip);
  const eocd = copy.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  copy.writeUInt16LE(1, eocd + 8);
  copy.writeUInt16LE(1, eocd + 10);
  copy.writeUInt32LE(46, eocd + 12);
  return copy;
}

describe("counting ZIP entries before they are opened", () => {
  it("counts the real directory, not the number the file claims", async () => {
    const honest = await manyEntries(300);
    expect(countZipEntries(honest, 1000)).toBe(300);
    expect(countZipEntries(lieAboutCount(honest), 1000)).toBe(300);
  });

  it("stops counting past the limit and refuses the file", async () => {
    const big = await manyEntries(300);
    expect(countZipEntries(big, 50)).toBe(51);
    expect(() => assertZipEntryCount(big, 50)).toThrow(ArchiveLimitError);
    expect(() => assertZipEntryCount(lieAboutCount(big), 50)).toThrow(/lists more than 50 files/);
    expect(() => assertZipEntryCount(big, 300)).not.toThrow();
  });

  it("leaves data that is not a ZIP to the real parser", () => {
    expect(countZipEntries(Buffer.from("not a zip at all"), 10)).toBeNull();
    expect(() => assertZipEntryCount(Buffer.alloc(5), 10)).not.toThrow();
  });
});

describe("Office files and archives that inflate far past their size", () => {
  it("refuses a Word file with a part that expands past the per-file cap", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("word/document.xml", Buffer.alloc(60 * 1024 * 1024, 0x61));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(assertOfficeWithinLimits(bomb)).rejects.toBeInstanceOf(ArchiveLimitError);

    const file = new File([new Uint8Array(bomb)], "report.docx");
    await expect(extractFromFile(file)).rejects.toThrow(/"report\.docx" was not opened because it expands to more than/);
  });

  it("accepts an ordinary Word-sized file", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document/>".repeat(1000));
    await expect(assertOfficeWithinLimits(await zip.generateAsync({ type: "nodebuffer" }))).resolves.toBeUndefined();
  });

  it("stops reading a deck whose slide expands past the part cap", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", Buffer.alloc(30 * 1024 * 1024, 0x20));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    await expect(pptxToText(bomb)).rejects.toBeInstanceOf(ArchiveLimitError);
  });

});

describe("notebook import against hostile archives", () => {
  it("refuses a manifest that inflates past its cap without keeping it", async () => {
    const zip = new JSZip();
    zip.file("manifest.json", Buffer.alloc(60 * 1000 * 1000, 0x20));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(importNotebookZip(bomb)).rejects.toThrow(/manifest is too large/);
  });

  it("refuses an archive that lists too many files, whatever its end record says", async () => {
    const lying = lieAboutCount(await manyEntries(2100));
    await expect(importNotebookZip(lying)).rejects.toBeInstanceOf(NotebookImportError);
    await expect(importNotebookZip(lying)).rejects.toThrow(/too many files/);
  });
});
