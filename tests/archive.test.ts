import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

// Images and media inside archives would call the model; nothing here should.
vi.mock("@/lib/ai", () => ({ transcribe: vi.fn() }));
vi.mock("@/lib/vision", async (orig) => ({
  ...(await orig<typeof import("@/lib/vision")>()),
  describeImage: vi.fn(async (_buf: Buffer, _mime: string, name: string) => ({
    title: `Image: ${name}`,
    text: "A described image.",
  })),
}));

import {
  describeUnreadableOffice,
  extractFromFile,
  extractFromZip,
  isZipUpload,
  type ArchiveEntry,
} from "@/lib/ingest";
import { pptxToText, resolvePartPath } from "@/lib/pptx";

const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function shape(type: string | null, ...paras: string[]) {
  const ph = type ? `<p:ph type="${type}"/>` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr>${ph}</p:nvPr></p:nvSpPr>
    <p:txBody><a:bodyPr/>${paras.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>`;
}

function slideXml(...shapes: string[]) {
  return `<?xml version="1.0"?><p:sld ${P} ${A} ${R}><p:cSld><p:spTree>${shapes.join("")}</p:spTree></p:cSld></p:sld>`;
}

/** A minimal deck whose slide files are numbered opposite to their order. */
async function makePptx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<p:presentation ${P} ${R}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId3" Type="${REL}/slide" Target="/ppt/slides/slide2.xml"/>
    </Relationships>`
  );
  zip.file(
    "ppt/slides/slide2.xml",
    slideXml(shape("ctrTitle", "Quarterly review"), shape("subTitle", "Finance team"), shape("sldNum", "1"))
  );
  zip.file(
    "ppt/slides/slide1.xml",
    slideXml(
      shape("title", "Revenue"),
      shape(null, "Up 12% year over year", "Driven by renewals"),
      `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>
        <a:tr><a:tc><a:txBody><a:p><a:r><a:t>Region</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Sales</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
        <a:tr><a:tc><a:txBody><a:p><a:r><a:t>EMEA</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>42</a:t></a:r></a:p></a:txBody></a:tc></a:tr>
      </a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
    )
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
    </Relationships>`
  );
  zip.file(
    "ppt/notesSlides/notesSlide1.xml",
    `<p:notes ${P} ${A}><p:cSld><p:spTree>${shape("body", "Mention the EMEA numbers.")}${shape("sldNum", "2")}</p:spTree></p:cSld></p:notes>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function collect(gen: AsyncGenerator<ArchiveEntry>) {
  const out: ArchiveEntry[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("resolvePartPath", () => {
  it("resolves relative and absolute targets", () => {
    expect(resolvePartPath("ppt/slides", "../notesSlides/n1.xml")).toBe("ppt/notesSlides/n1.xml");
    expect(resolvePartPath("ppt", "slides/slide1.xml")).toBe("ppt/slides/slide1.xml");
    expect(resolvePartPath("ppt", "/ppt/slides/slide2.xml")).toBe("ppt/slides/slide2.xml");
  });
});

describe("pptxToText", () => {
  it("reads slides in presentation order with titles and speaker notes", async () => {
    const text = await pptxToText(await makePptx());
    expect(text).toBe(
      [
        "Slide 1: Quarterly review\nFinance team",
        "Slide 2: Revenue\nUp 12% year over year\nDriven by renewals\nRegion | Sales\nEMEA | 42\nSpeaker notes: Mention the EMEA numbers.",
      ].join("\n\n")
    );
  });

  it("is used for .pptx uploads", async () => {
    const buf = await makePptx();
    const ex = await extractFromFile(new File([new Uint8Array(buf)], "deck.pptx"));
    expect(ex.kind).toBe("pptx");
    expect(ex.title).toBe("deck.pptx");
    expect(ex.text).toContain("Slide 2: Revenue");
  });

  it("explains a password-protected deck", () => {
    const ole = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(504),
      Buffer.from("EncryptedPackage", "utf16le"),
    ]);
    expect(describeUnreadableOffice(ole, "a.pptx", "pptx")).toMatch(/password-protected.*PowerPoint/);
  });
});

describe("isZipUpload", () => {
  it("recognizes archives but not Office files", () => {
    expect(isZipUpload("a.zip")).toBe(true);
    expect(isZipUpload("a", "application/x-zip-compressed")).toBe(true);
    expect(isZipUpload("a.docx", "application/zip")).toBe(false);
    expect(isZipUpload("a.pptx")).toBe(false);
  });
});

describe("extractFromZip", () => {
  it("imports supported files, opens nested archives and skips the rest", async () => {
    const inner = new JSZip();
    inner.file("inner.md", "# Inner notes\n\nNested content.");
    const zip = new JSZip();
    zip.file("project/readme.txt", "Plain text file.");
    zip.file("project/slides/deck.pptx", await makePptx());
    zip.file("project/photo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    zip.file("project/tool.exe", "MZ");
    zip.file("project/.DS_Store", "junk");
    zip.file("__MACOSX/project/._readme.txt", "junk");
    zip.file("project/more.zip", await inner.generateAsync({ type: "nodebuffer" }));

    const entries = await collect(
      extractFromZip(await zip.generateAsync({ type: "nodebuffer" }), "bundle.zip")
    );
    const byPath = Object.fromEntries(entries.map((e) => [e.path, e]));

    expect(Object.keys(byPath).sort()).toEqual([
      "more.zip/inner.md",
      "photo.png",
      "readme.txt",
      "slides/deck.pptx",
      "tool.exe",
    ]);
    expect(byPath["readme.txt"]).toMatchObject({
      extracted: { title: "readme.txt", kind: "txt", text: "Plain text file." },
    });
    expect(byPath["slides/deck.pptx"]).toMatchObject({
      extracted: { title: "slides/deck.pptx", kind: "pptx" },
    });
    expect(byPath["more.zip/inner.md"]).toMatchObject({ extracted: { kind: "md" } });
    expect(byPath["photo.png"]).toMatchObject({
      extracted: { title: "Image: photo.png", kind: "image" },
    });
    expect(byPath["tool.exe"]).toEqual({ path: "tool.exe", skipped: true });
  });

  it("reports a file that fails without stopping the rest", async () => {
    const zip = new JSZip();
    zip.file("bad.docx", "not a document");
    zip.file("good.txt", "Fine.");
    const entries = await collect(
      extractFromZip(await zip.generateAsync({ type: "nodebuffer" }), "mixed.zip")
    );
    expect(entries.find((e) => e.path === "bad.docx")).toMatchObject({
      error: expect.stringMatching(/not a valid Word document/),
    });
    expect(entries.find((e) => e.path === "good.txt")).toHaveProperty("extracted");
  });

  it("stops decompressing an entry that expands past the per-file limit", async () => {
    vi.resetModules();
    vi.stubEnv("MAX_UPLOAD_BYTES", String(64 * 1024));
    try {
      const ingest = await import("@/lib/ingest");
      const zip = new JSZip();
      zip.file("huge.txt", "a".repeat(1024 * 1024));
      const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      expect(buf.length).toBeLessThan(64 * 1024);
      const entries = await collect(ingest.extractFromZip(buf, "bomb.zip"));
      expect(entries).toEqual([
        { path: "huge.txt", error: expect.stringMatching(/per-file upload limit/) },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects something that is not a ZIP", async () => {
    await expect(collect(extractFromZip(Buffer.from("nope"), "x.zip"))).rejects.toThrow(
      /not a valid ZIP/
    );
  });
});
