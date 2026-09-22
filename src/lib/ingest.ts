import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { describeImage, imageMimeFor } from "./vision";
import { BlockedHostError, readCapped, safeFetch } from "./safefetch";

export type Extracted = { title: string; text: string; kind: string };

function clean(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Entities survive .text() when they were double-encoded in the source. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

export async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name || "Untitled";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());

  const imageMime = imageMimeFor(name, file.type);
  if (imageMime) {
    const described = await describeImage(buf, imageMime, name);
    return { title: described.title, text: described.text, kind: "image" };
  }

  if (ext === "pdf" || file.type === "application/pdf") {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { title: name, text: clean(String(text)), kind: "pdf" };
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { title: name, text: clean(value), kind: "docx" };
  }

  if (ext === "html" || ext === "htm") {
    return { title: name, text: htmlToText(buf.toString("utf8")).text, kind: "html" };
  }

  // txt, md, csv, json, code, ...
  return { title: name, text: clean(buf.toString("utf8")), kind: ext || "text" };
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

  return {
    title,
    text: decodeEntities(best.length >= whole.length * 0.25 ? best : whole),
  };
}

/** Browser-ish headers. Not a disguise — some servers simply 400 without them. */
export const FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OpenNotebook/1.0",
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,text/plain;q=0.7,*/*;q=0.5",
  "accept-language": "en-US,en;q=0.9",
};

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 20000);

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

export async function extractFromUrl(url: string): Promise<Extracted> {
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

  if (isPdf) {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = clean(String(text));
    if (!cleaned) {
      throw new Error(
        `The PDF at ${host} has no extractable text — it is probably a scan. Only images, no text layer.`
      );
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
    // the HTML reader try, in case it was mislabelled.
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
