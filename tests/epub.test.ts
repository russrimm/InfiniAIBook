import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { epubToText, resolveInArchive } from "@/lib/epub";
import { extractFromFile, extractFromZip } from "@/lib/ingest";

const CONTAINER = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

type Chapter = { id: string; file: string; body: string; linear?: boolean };

async function epub(chapters: Chapter[], over: { title?: string; author?: string; extra?: Record<string, string>; container?: string | null } = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  if (over.container !== null) zip.file("META-INF/container.xml", over.container ?? CONTAINER);
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${over.title ?? "Field Guide"}</dc:title>
    <dc:creator>${over.author ?? "A. Botanist"}</dc:creator>
  </metadata>
  <manifest>
    ${chapters.map((c) => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join("\n")}
    <item id="img" href="cover.png" media-type="image/png"/>
  </manifest>
  <spine>${chapters.map((c) => `<itemref idref="${c.id}"${c.linear === false ? ' linear="no"' : ""}/>`).join("")}</spine>
</package>`,
  );
  for (const c of chapters) {
    zip.file(`OEBPS/${c.file}`, `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${c.body}</body></html>`);
  }
  for (const [name, data] of Object.entries(over.extra ?? {})) zip.file(name, data);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("EPUB ingestion", () => {
  it("reads the title, author and chapters in reading order, with headings and paragraphs", async () => {
    const buf = await epub([
      { id: "c2", file: "two.xhtml", body: "<h1>Second</h1><p>Chlorophyll &amp; light.</p>" },
      { id: "c1", file: "one.xhtml", body: "<h2>First</h2><p>Line one<br/>line two</p><nav epub:type=\"toc\"><ol><li>Hidden toc</li></ol></nav>" },
      { id: "c3", file: "skip.xhtml", body: "<p>Not in the linear reading order.</p>", linear: false },
    ]);
    const book = await epubToText(buf, "guide.epub");
    expect(book.title).toBe("Field Guide by A. Botanist");
    expect(book.text).toBe("# Second\n\nChlorophyll & light.\n\n# First\n\nLine one\nline two");
    expect(book.text).not.toContain("Hidden toc");
    expect(book.text).not.toContain("linear");
    expect(book.note).toBeUndefined();
  });

  it("is imported as a source of kind epub from an upload, and from inside a ZIP", async () => {
    const buf = await epub([{ id: "a", file: "a.xhtml", body: "<p>Alpha text.</p>" }], { title: "Tiny" });
    const direct = await extractFromFile(new File([new Uint8Array(buf)], "tiny.epub", { type: "application/epub+zip" }));
    expect(direct).toMatchObject({ kind: "epub", title: "Tiny by A. Botanist", text: "Alpha text." });

    const outer = new JSZip();
    outer.file("books/tiny.epub", buf);
    const entries = [];
    for await (const e of extractFromZip(await outer.generateAsync({ type: "nodebuffer" }), "shelf.zip")) entries.push(e);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ path: "tiny.epub", extracted: { kind: "epub" } });
  });

  it("keeps hrefs inside the archive", () => {
    expect(resolveInArchive("OEBPS/content.opf", "text/ch1.xhtml#a")).toBe("OEBPS/text/ch1.xhtml");
    expect(resolveInArchive("OEBPS/content.opf", "../images/x.png")).toBe("images/x.png");
    expect(resolveInArchive("content.opf", "../../etc/passwd")).toBeNull();
    expect(resolveInArchive("OEBPS/content.opf", "a%20b.xhtml")).toBe("OEBPS/a b.xhtml");
  });

  it("skips a chapter whose path escapes the archive instead of reading it", async () => {
    const buf = await epub(
      [
        { id: "ok", file: "ok.xhtml", body: "<p>Safe chapter.</p>" },
        { id: "bad", file: "../../outside.xhtml", body: "<p>Escaped.</p>" },
      ],
    );
    const book = await epubToText(buf, "x.epub");
    expect(book.text).toBe("Safe chapter.");
  });

  it("explains a file that is not an EPUB, is incomplete, or is protected", async () => {
    await expect(epubToText(Buffer.from("not a zip"), "a.epub")).rejects.toThrow(/not a valid EPUB/);
    await expect(epubToText(await epub([{ id: "a", file: "a.xhtml", body: "<p>x</p>" }], { container: null }), "b.epub")).rejects.toThrow(/container\.xml/);
    await expect(epubToText(await epub([], {}), "c.epub")).rejects.toThrow(/no chapters/);
    const drm = await epub([{ id: "a", file: "a.xhtml", body: "<p>Secret.</p>" }], {
      extra: { "META-INF/encryption.xml": '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>' },
    });
    await expect(epubToText(drm, "d.epub")).rejects.toThrow(/DRM/);
    const fonts = await epub([{ id: "a", file: "a.xhtml", body: "<p>Readable.</p>" }], {
      extra: { "META-INF/encryption.xml": '<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>' },
    });
    expect((await epubToText(fonts, "e.epub")).text).toBe("Readable.");
    await expect(epubToText(await epub([{ id: "a", file: "a.xhtml", body: "<img src='p1.png'/>" }]), "f.epub")).rejects.toThrow(/no readable text/);
  });

  it("refuses an archive with an absurd number of files", async () => {
    const extra: Record<string, string> = {};
    for (let i = 0; i < 5001; i++) extra[`junk/${i}.txt`] = "x";
    await expect(epubToText(await epub([{ id: "a", file: "a.xhtml", body: "<p>x</p>" }], { extra }), "g.epub")).rejects.toThrow(/more than 5,000 files/);
  });

  it("stops at a character limit and says what was left out; an oversized chapter is skipped", async () => {
    const big = `<p>${"word ".repeat(180_000)}</p>`; // about 900,000 characters
    const chapters: Chapter[] = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, file: `c${i}.xhtml`, body: big }));
    const book = await epubToText(await epub(chapters), "long.epub");
    expect(book.text.length).toBeLessThanOrEqual(5_000_000);
    expect(book.note).toMatch(/Only the first/);
    expect(book.note).toMatch(/left out/);

    const bomb = await epub([
      { id: "ok", file: "ok.xhtml", body: "<p>Short and fine.</p>" },
      { id: "bomb", file: "bomb.xhtml", body: `<p>${"a".repeat(11 * 1024 * 1024)}</p>` },
    ]);
    expect((await epubToText(bomb, "bomb.epub")).text).toBe("Short and fine.");
  });
});
