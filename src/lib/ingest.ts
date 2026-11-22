import * as cheerio from "cheerio";
import JSZip from "jszip";
import { epubToText } from "./epub";
import { parseGoogleDocLink, privateDocMessage, titleFromDisposition, type GoogleDocLink } from "./googledocs";
import { ArchiveLimitError, assertZipEntryCount, readEntryCapped } from "./zipread";
import { assertOfficeWithinLimits } from "./officeguard";
import mammoth from "mammoth";
import { describeImage, imageMimeFor } from "./vision";
import { BlockedHostError, readCapped, safeFetch } from "./safefetch";
import { transcribe } from "./ai";
import { pptxToText } from "./pptx";
import {
  MAX_ARCHIVE_DEPTH,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_EXPANDED_BYTES,
  MAX_ARCHIVE_FILES,
  MAX_UPLOAD_BYTES,
  mb,
} from "./limits";
import { envInt } from "./envnumber";
import { decodeEntities } from "./htmltext";

export type Extracted = { title: string; text: string; kind: string };

/** Containers the transcription API accepts, and the MIME type to send each as. */
const MEDIA_TYPES: Record<string, { mime: string; kind: "audio" | "video" }> = {
  mp3: { mime: "audio/mpeg", kind: "audio" },
  mpga: { mime: "audio/mpeg", kind: "audio" },
  mpeg: { mime: "audio/mpeg", kind: "audio" },
  m4a: { mime: "audio/mp4", kind: "audio" },
  wav: { mime: "audio/wav", kind: "audio" },
  ogg: { mime: "audio/ogg", kind: "audio" },
  oga: { mime: "audio/ogg", kind: "audio" },
  flac: { mime: "audio/flac", kind: "audio" },
  webm: { mime: "audio/webm", kind: "video" },
  mp4: { mime: "video/mp4", kind: "video" },
};

export const MEDIA_EXTENSIONS = Object.keys(MEDIA_TYPES);

export function mediaTypeFor(name: string, contentType?: string) {
  const ext = name.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (MEDIA_TYPES[ext]) return { ext, ...MEDIA_TYPES[ext] };
  const ct = contentType?.toLowerCase() ?? "";
  if (/^(audio|video)\//.test(ct)) {
    const match = Object.entries(MEDIA_TYPES).find(([, v]) => v.mime === ct);
    const kind = ct.startsWith("video/") ? ("video" as const) : ("audio" as const);
    return { ext: match?.[0] ?? (kind === "video" ? "mp4" : "mp3"), mime: ct, kind };
  }
  return null;
}

async function transcribeMedia(
  buf: Buffer,
  name: string,
  media: { ext: string; mime: string; kind: "audio" | "video" }
): Promise<Extracted> {
  // The API infers the codec from the filename, so it must carry an extension.
  const filename = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${media.ext}`;
  const text = clean(await transcribe(buf, filename, media.mime));
  if (!text) throw new Error(`No speech was recognized in "${name}".`);
  return { title: name, text, kind: media.kind };
}

function clean(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const OFFICE_FORMATS = {
  docx: { app: "Word", noun: "Word document", protect: "Protect Document" },
  pptx: { app: "PowerPoint", noun: "PowerPoint presentation", protect: "Protect Presentation" },
} as const;

/**
 * A real .docx or .pptx is a ZIP. Encrypted ones (sensitivity labels, IRM,
 * passwords) and legacy .doc/.ppt files renamed to the new extension are OLE
 * compound files instead, which the ZIP reader rejects with an opaque error.
 * Explain what the user can do.
 */
export function describeUnreadableOffice(
  buf: Buffer,
  name: string,
  format: keyof typeof OFFICE_FORMATS
): string | null {
  if (buf.subarray(0, 4).toString("latin1") === "PK\x03\x04") return null;
  const { app, noun, protect } = OFFICE_FORMATS[format];
  if (!buf.subarray(0, 8).equals(OLE_MAGIC)) {
    return `"${name}" is not a valid ${noun}. Re-save it as .${format} and try again.`;
  }
  // OLE directory entry names are stored as UTF-16LE.
  const has = (s: string) => buf.includes(Buffer.from(s, "utf16le"));
  if (has("DRMEncrypted")) {
    return `"${name}" is protected by a sensitivity label or rights management (IRM), so its contents are encrypted. Remove the protection in ${app}, or copy the text and use "Paste".`;
  }
  if (has("EncryptedPackage") || has("EncryptionInfo")) {
    return `"${name}" is password-protected. Remove the password in ${app} (File > Info > ${protect}) and try again.`;
  }
  return `"${name}" is a legacy ${app} 97–2003 file with a .${format} extension. Open it in ${app} and save it as .${format}.`;
}

export function describeUnreadableDocx(buf: Buffer, name: string): string | null {
  return describeUnreadableOffice(buf, name, "docx");
}

export async function extractFromFile(file: File): Promise<Extracted> {
  return extractFromBuffer(Buffer.from(await file.arrayBuffer()), file.name || "Untitled", file.type);
}

/** What to say when a PDF has pictures of pages instead of text. */
export const SCANNED_PDF_HELP =
  "has no text layer, so it is probably a scan of paper pages, and this app does not run OCR on PDFs. Make it searchable first (Google Drive: right-click, Open with Google Docs; Adobe Acrobat: Scan & OCR; or save a \"searchable PDF\" from your scanner app) and add it again. You can also add photos of the pages as images, which the vision model reads.";

/** Run an Office check or read, saying plainly why a file that is far too large for its kind was not opened. */
async function guardOffice<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ArchiveLimitError) {
      throw new Error(`"${name}" was not opened because ${e.message}, far more than a real document holds.`);
    }
    throw e;
  }
}

async function extractFromBuffer(buf: Buffer, name: string, type = ""): Promise<Extracted> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  const imageMime = imageMimeFor(name, type);
  if (imageMime) {
    const described = await describeImage(buf, imageMime, name);
    return { title: described.title, text: described.text, kind: "image" };
  }

  const media = mediaTypeFor(name, type);
  if (media) return transcribeMedia(buf, name, media);

  if (ext === "pdf" || type === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = clean(String(text));
    if (!cleaned) throw new Error(`"${name}" ${SCANNED_PDF_HELP}`);
    return { title: name, text: cleaned, kind: "pdf" };
  }

  if (ext === "docx") {
    const problem = describeUnreadableDocx(buf, name);
    if (problem) throw new Error(problem);
    await guardOffice(name, () => assertOfficeWithinLimits(buf));
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { title: name, text: clean(value), kind: "docx" };
  }

  if (ext === "pptx") {
    const problem = describeUnreadableOffice(buf, name, "pptx");
    if (problem) throw new Error(problem);
    const text = clean(await guardOffice(name, () => pptxToText(buf)));
    if (!text) {
      throw new Error(`"${name}" has no text on its slides or in its speaker notes — it may contain only images.`);
    }
    return { title: name, text, kind: "pptx" };
  }

  if (ext === "html" || ext === "htm") {
    return { title: name, text: htmlToText(buf.toString("utf8")).text, kind: "html" };
  }

  if (ext === "epub" || type === "application/epub+zip") {
    const book = await epubToText(buf, name);
    return { title: book.title, text: book.text, kind: "epub" };
  }

  // txt, md, csv, json, code, ...
  return { title: name, text: clean(buf.toString("utf8")), kind: ext || "text" };
}

const ZIP_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
]);

export function isZipUpload(name: string, type = ""): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "zip") return true;
  // Office files are ZIPs too, and some browsers label them that way.
  return ZIP_MIME_TYPES.has(type.toLowerCase()) && !(ext in OFFICE_FORMATS);
}

/** Text formats imported from an archive; anything else in it is skipped. */
const ARCHIVE_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "har",
  "xml",
  "gpx",
  "kml",
  "html",
  "htm",
]);

function isArchiveImportable(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (
    ext === "pdf" ||
    ext === "epub" ||
    ext in OFFICE_FORMATS ||
    ARCHIVE_TEXT_EXTENSIONS.has(ext) ||
    !!imageMimeFor(path) ||
    !!mediaTypeFor(path)
  );
}

/** OS and editor droppings that are never worth reporting as skipped. */
function isArchiveJunk(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    path.startsWith("__MACOSX/") ||
    path.split("/").some((seg) => seg.startsWith(".")) ||
    base.startsWith("~$") ||
    /^(thumbs\.db|desktop\.ini)$/i.test(base)
  );
}

export type ArchiveEntry =
  | { path: string; extracted: Extracted }
  | { path: string; error: string }
  | { path: string; skipped: true };

async function openZip(buf: Buffer, name: string): Promise<JSZip> {
  try {
    assertZipEntryCount(buf, MAX_ARCHIVE_ENTRIES);
  } catch (e) {
    if (e instanceof ArchiveLimitError) {
      throw new Error(`"${name}" was not opened because ${e.message}. Zip only the files you want to add.`);
    }
    throw e;
  }
  try {
    return await JSZip.loadAsync(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/encrypt/i.test(msg)) {
      throw new Error(`"${name}" is password-protected. Extract it, or re-create it without a password, and try again.`);
    }
    throw new Error(`"${name}" is not a valid ZIP archive.`);
  }
}

/**
 * Unpack a ZIP and extract every supported file inside it, one at a time.
 * Nested archives are opened too, up to a few levels deep. Limits on file
 * count and total expanded size apply to the whole upload, nested archives
 * included.
 */
export async function* extractFromZip(buf: Buffer, name: string): AsyncGenerator<ArchiveEntry> {
  const budget = { files: MAX_ARCHIVE_FILES, bytes: MAX_ARCHIVE_EXPANDED_BYTES, truncated: false };
  yield* walkZip(buf, name, "", 0, budget);
}

async function* walkZip(
  buf: Buffer,
  name: string,
  prefix: string,
  depth: number,
  budget: { files: number; bytes: number; truncated: boolean }
): AsyncGenerator<ArchiveEntry> {
  const zip = await openZip(buf, name);
  const entries = Object.values(zip.files).filter(
    (f) => !f.dir && !isArchiveJunk(f.name)
  );

  // A folder zipped from Explorer or Finder puts everything under one root
  // folder, which adds nothing to each source's title.
  const roots = new Set(entries.map((f) => (f.name.includes("/") ? f.name.split("/")[0] : "")));
  const root = roots.size === 1 && !roots.has("") ? `${[...roots][0]}/` : "";

  for (const entry of entries) {
    const path = prefix + entry.name.slice(root.length);
    const nested = /\.zip$/i.test(entry.name);

    if (!nested && !isArchiveImportable(entry.name)) {
      yield { path, skipped: true };
      continue;
    }
    if (nested && depth >= MAX_ARCHIVE_DEPTH) {
      yield { path, error: "archives nested this deeply are not opened." };
      continue;
    }
    // Archives inside archives use the file budget too, or thousands of tiny
    // ones would each be opened for free.
    if (budget.files <= 0 || budget.bytes <= 0) {
      // Reported once; listing every file left out would bury the real errors.
      if (!budget.truncated) {
        budget.truncated = true;
        const limit =
          budget.files <= 0
            ? `only the first ${MAX_ARCHIVE_FILES} files in an archive are imported`
            : `the archive expands to more than ${mb(MAX_ARCHIVE_EXPANDED_BYTES)} in total`;
        yield { path, error: `${limit}; this and the remaining files were left out.` };
      }
      continue;
    }

    let data: Buffer;
    try {
      data = await readEntryCapped(entry, Math.min(MAX_UPLOAD_BYTES, budget.bytes));
    } catch (e) {
      if (e instanceof ArchiveLimitError && budget.bytes < MAX_UPLOAD_BYTES) {
        budget.bytes = 0;
        if (!budget.truncated) {
          budget.truncated = true;
          yield {
            path,
            error: `the archive expands to more than ${mb(MAX_ARCHIVE_EXPANDED_BYTES)} in total; this and the remaining files were left out.`,
          };
        }
        continue;
      }
      yield {
        path,
        error:
          e instanceof ArchiveLimitError
            ? `${e.message}, which is over the per-file upload limit.`
            : "it could not be decompressed.",
      };
      continue;
    }
    budget.bytes -= data.length;

    if (nested) {
      budget.files--;
      try {
        yield* walkZip(data, path, `${path}/`, depth + 1, budget);
      } catch (e) {
        yield { path, error: e instanceof Error ? e.message : "could not be opened." };
      }
      continue;
    }

    budget.files--;
    const base = entry.name.split("/").pop() || entry.name;
    try {
      const extracted = await extractFromBuffer(data, base);
      // Keep the folder path so same-named files from different folders stay
      // distinguishable; images keep the title their description gave them.
      yield {
        path,
        extracted: extracted.kind === "image" ? extracted : { ...extracted, title: path },
      };
    } catch (e) {
      yield { path, error: e instanceof Error ? e.message : "failed" };
    }
  }
}

/** Containers that usually hold the real article, best first. */
const CONTENT_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  ".entry-content",
  ".post-content",
  ".article-content",
  ".article-body",
  "#content",
  ".content",
];

/**
 * Elements that never contain article text.
 *
 * Deliberately excludes <form>: some sites wrap their whole page in one, so
 * removing it discards everything. Form *controls* are stripped separately.
 */
const NOISE = "script, style, noscript, svg, iframe, template";

/** Widgets that contribute label noise rather than prose. */
const CONTROLS = "input, select, textarea, button, option";

/** Boilerplate that usually wraps content — but sometimes contains it. */
const CHROME = "nav, header, footer, aside";

function textOf($: cheerio.CheerioAPI, sel: string): string {
  return clean($(sel).text());
}

/**
 * Pull readable text out of a page.
 *
 * Removing structural elements outright is unsafe: some sites nest <main>
 * inside <header>, others wrap the page in a <form>, and stripping either
 * discards the article. So prefer an explicit content container, fall back
 * progressively, and never return less than simply reading the body — measured
 * against a pristine copy, so an over-aggressive strip cannot lower the bar it
 * is being checked against.
 */
function htmlToText(html: string): { title: string; text: string } {
  const floor = cheerio.load(html);
  floor("script, style, noscript").remove();
  const whole = clean(floor("body").text());

  const $ = cheerio.load(html);
  $(NOISE).remove();
  $(CONTROLS).remove();

  const title = decodeEntities(
    $("title").first().text().trim() ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      $("h1").first().text().trim() ||
      ""
  );
  let best = "";
  for (const sel of CONTENT_SELECTORS) {
    if (!$(sel).length) continue;
    const candidate = textOf($, sel);
    if (candidate.length > best.length) best = candidate;
    // A container holding most of the page is the article; stop looking.
    if (best.length > whole.length * 0.5) break;
  }

  // Otherwise drop the surrounding chrome, but only if content survives.
  if (best.length < 200) {
    const $$ = cheerio.load(html);
    $$(NOISE).remove();
    $$(CONTROLS).remove();
    $$(CHROME).remove();
    const stripped = clean($$("body").text());
    if (stripped.length > best.length) best = stripped;
  }

  // Entities survive .text() when they were double-encoded in the source, so
  // decode once more. Single pass: "&amp;lt;" must end as "&lt;", not "<".
  return {
    title,
    text: decodeEntities(best.length >= whole.length * 0.25 ? best : whole),
  };
}

/** Browser-ish headers. Not a disguise — some servers simply 400 without them. */
export const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 InfiniAIBook/1.0",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.5",
  "accept-language": "en-US,en;q=0.9",
};

const FETCH_TIMEOUT_MS = envInt("FETCH_TIMEOUT_MS", 20000);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Turn a transport failure into something the user can act on. */
function describeFetchFailure(e: unknown, host: string): Error {
  if ((e as { name?: string })?.name === "AbortError") {
    return new Error(
      `${host} did not respond within ${Math.round(FETCH_TIMEOUT_MS / 1000)}s. It may be slow or blocking automated requests.`
    );
  }
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return new Error(`${host} could not be resolved — the domain may no longer exist.`);
    case "ECONNREFUSED":
      return new Error(`${host} refused the connection.`);
    case "ECONNRESET":
      return new Error(`${host} closed the connection, which often means it blocks automated requests.`);
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return new Error(`${host} has an invalid HTTPS certificate (${code}).`);
    default:
      return new Error(
        `Could not reach ${host}${code ? ` (${code})` : ""}. Open the page and use "Paste" to add its text.`
      );
  }
}

/**
 * RSS 2.0, RDF and Atom all describe a list of dated entries, so they are
 * flattened to one readable block per entry rather than run through the HTML
 * reader, which treats a feed as a single page of run-together tag soup.
 */
export function feedToText(xml: string): { title: string; text: string } | null {
  const $ = cheerio.load(xml, { xml: true });
  const items = $("item, entry");
  if (items.length === 0) return null;

  const feedTitle = clean(
    decodeEntities($("channel > title, feed > title").first().text() || "")
  );

  const blocks: string[] = [];
  items.each((_, el) => {
    const n = $(el);
    const title = clean(decodeEntities(n.children("title").first().text() || ""));
    const date = clean(
      n.children("pubDate, published, updated, dc\\:date").first().text() || ""
    );
    // Feeds put the body in any of these; content:encoded is the fullest when
    // present, and the rest are progressively shorter summaries.
    const bodyRaw =
      n.children("content\\:encoded").first().text() ||
      n.children("content").first().text() ||
      n.children("description").first().text() ||
      n.children("summary").first().text() ||
      "";
    // Entry bodies are usually escaped HTML, so they need the HTML reader.
    const body = bodyRaw.includes("<")
      ? htmlToText(`<body>${bodyRaw}</body>`).text
      : clean(decodeEntities(bodyRaw));
    const link = clean(
      n.children("link").first().text() || n.children("link").first().attr("href") || ""
    );

    const head = [title, date && `(${date})`].filter(Boolean).join(" ");
    const block = [head, body, link].filter(Boolean).join("\n");
    if (block.trim()) blocks.push(block.trim());
  });

  if (!blocks.length) return null;
  return { title: feedTitle, text: clean(blocks.join("\n\n")) };
}

/** Feeds arrive under half a dozen content types, and often the wrong one. */
function looksLikeFeed(ctype: string, raw: string): boolean {
  if (/(rss|atom)\+xml/i.test(ctype)) return true;
  const head = raw.slice(0, 1500);
  return /<(rss|feed)\b/i.test(head) || /<rdf:RDF\b/i.test(head);
}

/**
 * A Google Doc, Sheet or Slides deck shared with "Anyone with the link", read
 * through its text export. Goes through the same guarded fetch as any URL.
 */
async function extractFromGoogleDoc(link: GoogleDocLink): Promise<Extracted> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  let finalUrl: string;
  try {
    ({ res, finalUrl } = await safeFetch(link.exportUrl, { headers: FETCH_HEADERS, signal: controller.signal }));
  } catch (e) {
    if (e instanceof BlockedHostError) throw e;
    throw describeFetchFailure(e, "docs.google.com");
  } finally {
    clearTimeout(timer);
  }
  // A private document answers with an error or a redirect to the sign-in page.
  const signIn = /(^|\.)accounts\.google\.com$/i.test(new URL(finalUrl).hostname);
  if (signIn || res.status === 401 || res.status === 403 || res.status === 404) throw new Error(privateDocMessage(link));
  if (res.status === 429) throw new Error("Google is rate-limiting requests (429). Try again shortly.");
  if (!res.ok) throw new Error(`Google returned ${res.status} for this ${link.noun}.`);
  const ctype = res.headers.get("content-type") ?? "";
  const raw = (await readCapped(res)).toString("utf8").replace(/^\uFEFF/, "");
  // An HTML reply is a sign-in or error page, not the document.
  if (ctype.includes("text/html") || /^\s*<(!doctype|html)/i.test(raw)) throw new Error(privateDocMessage(link));
  const text = clean(raw);
  if (!text) throw new Error(`This ${link.noun} is empty, so there is nothing to add.`);
  return { title: titleFromDisposition(res.headers.get("content-disposition")) ?? link.noun, text, kind: "url" };
}

export async function extractFromUrl(url: string): Promise<Extracted> {
  const gdoc = parseGoogleDocLink(url);
  if (gdoc) return extractFromGoogleDoc(gdoc);
  const host = hostOf(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  let finalUrl: string;
  try {
    // Guarded rather than a plain fetch: this URL came from whoever is adding
    // the source, and the redirect chain is theirs to choose too.
    ({ res, finalUrl } = await safeFetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
    }));
  } catch (e) {
    if (e instanceof BlockedHostError) throw e;
    throw describeFetchFailure(e, host);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // 401/403 here is the publisher refusing automated access, not a bug on
    // our side, and the user can only act on it if we say so.
    if (res.status === 403 || res.status === 401) {
      throw new Error(
        `${host} blocked automated access (${res.status}). Many publishers do. Open the page and use "Paste" to add its text.`
      );
    }
    if (res.status === 404) throw new Error(`${host} returned 404 — the page is gone.`);
    if (res.status === 429) {
      throw new Error(`${host} is rate-limiting requests (429). Try again shortly.`);
    }
    throw new Error(`${host} returned ${res.status}.`);
  }

  // Paths are read from where the chain actually ended, not from what was
  // typed: a redirect to a PDF should still be treated as a PDF.
  const path = new URL(finalUrl).pathname;
  const ctype = res.headers.get("content-type") ?? "";
  const looksLikePdf =
    ctype.includes("application/pdf") || /\.pdf($|[?#])/i.test(path);

  // Some servers send PDFs as octet-stream, so sniff the magic bytes too.
  const buf = await readCapped(res);
  const isPdf = looksLikePdf || buf.subarray(0, 5).toString("latin1") === "%PDF-";

  // A URL that points straight at an image is described rather than parsed.
  const imageMime = imageMimeFor(path, ctype.split(";")[0]?.trim());
  if (imageMime && !isPdf) {
    const filename = decodeURIComponent(path.split("/").pop() || host);
    const described = await describeImage(buf, imageMime, filename);
    return { title: described.title, text: described.text, kind: "image" };
  }

  // A direct link to an audio or video file is transcribed.
  const media = isPdf ? null : mediaTypeFor(path, ctype.split(";")[0]?.trim());
  if (media) {
    return transcribeMedia(buf, decodeURIComponent(path.split("/").pop() || host), media);
  }

  if (isPdf) {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = clean(String(text));
    if (!cleaned) {
      throw new Error(`The PDF at ${host} ${SCANNED_PDF_HELP}`);
    }
    return { title: decodeURIComponent(url.split("/").pop() || host), text: cleaned, kind: "pdf" };
  }

  const raw = buf.toString("utf8");

  if (looksLikeFeed(ctype, raw)) {
    const feed = feedToText(raw);
    if (feed?.text) {
      return { title: feed.title || host, text: feed.text, kind: "feed" };
    }
    // An empty feed is not an error worth failing on — fall through and let
    // the HTML reader try, in case it was mislabeled.
  }

  if (ctype.includes("text/html") || raw.trimStart().startsWith("<")) {
    const { title, text } = htmlToText(raw);
    if (!text) {
      throw new Error(
        `${host} returned a page with no readable text. It likely renders its content with JavaScript, which this fetch cannot run.`
      );
    }
    return { title: title || host, text, kind: "url" };
  }
  return { title: host, text: clean(raw), kind: "url" };
}

/** Split text into overlapping chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, size = 1400, overlap = 200): string[] {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let cur = "";

  const push = () => {
    const t = cur.trim();
    if (t.length > 0) chunks.push(t);
    cur = "";
  };

  for (const p of paras) {
    if (p.length > size) {
      push();
      for (let i = 0; i < p.length; i += size - overlap) {
        chunks.push(p.slice(i, i + size).trim());
      }
      continue;
    }
    if (cur.length + p.length + 2 > size) {
      const tail = cur.slice(-overlap);
      push();
      cur = tail.trim() ? tail.trim() + "\n\n" + p : p;
    } else {
      cur = cur ? cur + "\n\n" + p : p;
    }
  }
  push();
  return chunks.filter((c) => c.length > 40 || chunks.length === 1);
}
