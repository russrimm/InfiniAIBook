import * as cheerio from "cheerio";
import JSZip from "jszip";
import { MAX_ARCHIVE_EXPANDED_BYTES, mb } from "./limits";
import { ArchiveLimitError, readEntryCapped } from "./zipread";

/**
 * Reads the text of an EPUB: its title and author, then every chapter in
 * reading order. Nothing is ever written to disk, so there is no path to
 * traverse; the limits below stop a hostile archive from using memory.
 */

/** Most entries an EPUB may list. Real books have a few hundred. */
const MAX_ENTRIES = 5000;
/** The largest single chapter, package or container file read. */
const MAX_PART_BYTES = 10 * 1024 * 1024;
/** Most characters of book text kept; the rest is dropped with a note. */
export const MAX_EPUB_CHARS = 5_000_000;

const XHTML = /^(application\/xhtml\+xml|text\/html|application\/xml|text\/xml)$/i;

export type EpubText = { title: string; text: string; note?: string };

const clean = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/** One chapter's XHTML as plain text: paragraphs and headings keep their line breaks. */
export function chapterText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav[epub\\:type='toc'], nav[role='doc-toc']").remove();
  $("br").replaceWith("\n");
  $("h1, h2, h3").each((_, el) => {
    const t = $(el).text().trim();
    if (t) $(el).text(`# ${t}`);
  });
  $("p, div, section, article, li, tr, blockquote, pre, h1, h2, h3, h4, h5, h6, figcaption, dt, dd").each((_, el) => {
    $(el).append("\n\n");
  });
  return clean($("body").length ? $("body").text() : $.root().text());
}

/** `href` resolved against the folder of `base`, without leaving the archive. Null when it would escape. */
export function resolveInArchive(base: string, href: string): string | null {
  const [path] = decodeURIComponent(href).split("#");
  const parts = base.split("/").slice(0, -1);
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

async function readText(zip: JSZip, path: string, cap: number): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return (await readEntryCapped(entry, cap)).toString("utf8");
}

export async function epubToText(buf: Buffer, name: string): Promise<EpubText> {
  const bad = (why: string) => new Error(`"${name}" ${why}`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw bad("is not a valid EPUB (it is not a readable ZIP archive).");
  }
  if (Object.keys(zip.files).length > MAX_ENTRIES) {
    throw bad(`lists more than ${MAX_ENTRIES.toLocaleString("en-US")} files, which is far more than a book has.`);
  }

  try {
    const encryption = await readText(zip, "META-INF/encryption.xml", MAX_PART_BYTES);
    // Embedded fonts are routinely obfuscated; anything else being encrypted is DRM.
    if (encryption && /<(\w+:)?EncryptionMethod[^>]*Algorithm="(?!http:\/\/www\.idpf\.org\/2008\/embedding|http:\/\/ansi\.org\/)/i.test(encryption)) {
      throw bad("is protected by DRM, so its text cannot be read. Use a DRM-free copy.");
    }

    const container = await readText(zip, "META-INF/container.xml", MAX_PART_BYTES);
    if (!container) throw bad("is not a valid EPUB (it has no META-INF/container.xml).");
    const rootPath = cheerio.load(container, { xml: true })("rootfile").first().attr("full-path");
    if (!rootPath || resolveInArchive("x", rootPath) === null) throw bad("is not a valid EPUB (its package file is missing or invalid).");
    const opfPath = resolveInArchive("x", rootPath)!;
    const opfXml = await readText(zip, opfPath, MAX_PART_BYTES);
    if (!opfXml) throw bad("is not a valid EPUB (its package file is missing).");

    const opf = cheerio.load(opfXml, { xml: true });
    const manifest = new Map<string, { href: string; type: string }>();
    opf("manifest > item").each((_, el) => {
      const id = opf(el).attr("id");
      const href = opf(el).attr("href");
      if (id && href) manifest.set(id, { href, type: opf(el).attr("media-type") ?? "" });
    });
    const order: string[] = [];
    opf("spine > itemref").each((_, el) => {
      const idref = opf(el).attr("idref");
      if (idref && opf(el).attr("linear") !== "no") order.push(idref);
    });
    if (order.length === 0) throw bad("has no chapters in its reading order.");

    const meta = (tag: string) => opf(`metadata > *`).filter((_, el) => (el as { name?: string }).name?.toLowerCase().endsWith(`:${tag}`) || (el as { name?: string }).name?.toLowerCase() === tag).first().text().replace(/\s+/g, " ").trim();
    const bookTitle = meta("title");
    const author = meta("creator");

    let text = "";
    let used = 0;
    let omitted = 0;
    let truncated = false;
    for (const idref of order) {
      const item = manifest.get(idref);
      if (!item || !XHTML.test(item.type)) continue;
      const path = resolveInArchive(opfPath, item.href);
      if (path === null) continue;
      if (text.length >= MAX_EPUB_CHARS) {
        truncated = true;
        omitted++;
        continue;
      }
      let html: string | null;
      try {
        html = await readText(zip, path, Math.min(MAX_PART_BYTES, MAX_ARCHIVE_EXPANDED_BYTES - used));
      } catch (e) {
        if (e instanceof ArchiveLimitError) {
          omitted++;
          continue;
        }
        throw e;
      }
      if (html === null) continue;
      used += html.length;
      const chapter = chapterText(html);
      if (chapter) text += `${chapter}\n\n`;
    }

    text = clean(text);
    if (!text) {
      throw bad("has no readable text. It may be made of page images only (a scanned or comic EPUB).");
    }
    if (text.length > MAX_EPUB_CHARS) {
      text = text.slice(0, MAX_EPUB_CHARS);
      truncated = true;
    }
    const title = [bookTitle, author && `by ${author}`].filter(Boolean).join(" ") || name;
    return {
      title,
      text,
      ...(truncated
        ? { note: `Only the first ${mb(MAX_EPUB_CHARS)} of text (about ${(MAX_EPUB_CHARS / 1_000_000).toFixed(0)} million characters) was kept${omitted ? `; ${omitted} later chapter${omitted === 1 ? " was" : "s were"} left out` : ""}.` }
        : {}),
    };
  } catch (e) {
    if (e instanceof ArchiveLimitError) throw bad(`is too large to read safely (${e.message}).`);
    throw e;
  }
}
