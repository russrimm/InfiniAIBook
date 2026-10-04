/**
 * Real product screenshots for training-video slides, from Microsoft Learn.
 *
 * Learn documentation is full of annotated screenshots of the Azure portal,
 * the Microsoft 365 admin centers, Copilot Studio and the rest, each with alt
 * text that says what it shows ("Screenshot of the Tile Gallery."). A visual's
 * search query goes to the public Microsoft Learn MCP server's docs search,
 * whose passages carry their screenshots inline; when the best passages have
 * none, the articles they come from are read for theirs.
 *
 * Everything is fetched through safeFetch and capped in size, and only
 * learn.microsoft.com pages and images are used.
 */
import * as cheerio from "cheerio";
import { readCapped, safeFetch } from "./safefetch";

export const LEARN_CREDIT = "Microsoft Learn";
const LEARN_HOST = "learn.microsoft.com";
const MCP_URL = "https://learn.microsoft.com/api/mcp";
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 260;

export type LearnImage = {
  /** Absolute URL of the largest version of the picture on the page. */
  src: string;
  alt: string;
  page: string;
  pageTitle: string;
};

export type LearnScreenshot = {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  alt: string;
  page: string;
};

export type LearnPassage = { title: string; content: string; url: string };

const STOP = new Set(
  "a an and are as at be by for from how in into is it of on or the to use using with your you what when where which".split(
    " "
  )
);

export const keywords = (s: string) =>
  [...new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)))];

const isLearn = (u: URL) => u.protocol === "https:" && u.hostname === LEARN_HOST;

/** A content picture worth showing, judged by its address and alt text; null otherwise. */
function contentImage(raw: string, alt: string, base: string): URL | null {
  alt = alt.replace(/\s+/g, " ").trim();
  if (!raw || alt.length < 12) return null;
  if (!/screenshot|screen shot|diagram|illustration|shows|showing/i.test(alt)) return null;
  if (/\b(icon|logo|badge|avatar|button)\b/i.test(alt) && !/screenshot/i.test(alt)) return null;
  let src: URL;
  try {
    src = new URL(raw, base);
  } catch {
    return null;
  }
  if (!isLearn(src) || !/\.(png|jpe?g)$/i.test(src.pathname) || /\/media\/(index|logos?)\//i.test(src.pathname)) {
    return null;
  }
  src.hash = "";
  return src;
}

/**
 * Screenshots and diagrams in a Learn article: content pictures only, at the
 * size the lightbox links to when the page shows a smaller inline copy.
 */
export function parseLearnImages(html: string, pageUrl: string): LearnImage[] {
  const $ = cheerio.load(html);
  const pageTitle = $("h1").first().text().trim() || $("title").text().trim();
  const root = $("main").length ? $("main") : $("body");
  const out: LearnImage[] = [];
  const seen = new Set<string>();
  root.find("img").each((_, el) => {
    const img = $(el);
    const alt = (img.attr("alt") ?? "").replace(/\s+/g, " ").trim();
    const link = img.closest("a").attr("href") ?? "";
    const bigger = /#lightbox$/i.test(link) ? link.replace(/#lightbox$/i, "") : "";
    const src = contentImage(bigger || (img.attr("src") ?? ""), alt, pageUrl);
    if (!src || seen.has(src.href)) return;
    seen.add(src.href);
    out.push({ src: src.href, alt, page: pageUrl, pageTitle });
  });
  return out;
}

/** The pictures embedded in search passages, as `![alt](url)` Markdown. */
export function passageImages(passages: LearnPassage[]): LearnImage[] {
  const out: LearnImage[] = [];
  const seen = new Set<string>();
  for (const p of passages) {
    for (const m of p.content.matchAll(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const alt = m[1].replace(/\s+/g, " ").trim();
      const src = contentImage(m[2], alt, p.url);
      if (!src || seen.has(src.href)) continue;
      seen.add(src.href);
      out.push({ src: src.href, alt, page: p.url, pageTitle: p.title });
    }
  }
  return out;
}

/** Best match first: words of the query in the alt text and page title, screenshots ahead of diagrams. */
export function rankLearnImages(images: LearnImage[], query: string, pageRank: Map<string, number> = new Map()): LearnImage[] {
  const words = keywords(query);
  const score = (img: LearnImage) => {
    const alt = new Set(keywords(img.alt));
    const title = new Set(keywords(img.pageTitle));
    let s = 0;
    for (const w of words) {
      if (alt.has(w)) s += 2;
      else if (title.has(w)) s += 1;
    }
    if (/screenshot/i.test(img.alt)) s += 1.5;
    s -= (pageRank.get(img.page) ?? 0) * 0.75;
    return s;
  };
  return images
    .map((img, i) => ({ img, i, s: score(img) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.img);
}

/** Pixel size of a PNG or JPEG, read from its header. */
export function imageSize(b: Buffer): { mime: LearnScreenshot["mime"]; width: number; height: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 && b.toString("ascii", 12, 16) === "IHDR") {
    return { mime: "image/png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * The docs-search reply of the Learn MCP server: a JSON-RPC result, sent as
 * plain JSON or as one server-sent event, whose text content is itself JSON.
 */
export function parseLearnSearch(body: string): LearnPassage[] {
  const messages = body.trimStart().startsWith("{")
    ? [body]
    : body
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim());
  for (const m of messages) {
    try {
      const rpc = JSON.parse(m) as { result?: { content?: { type?: string; text?: string }[] } };
      const text = rpc.result?.content?.find((c) => c.type === "text")?.text;
      if (!text) continue;
      const inner = JSON.parse(text) as { results?: { title?: unknown; content?: unknown; contentUrl?: unknown }[] };
      return (inner.results ?? []).flatMap((r) => {
        if (typeof r.contentUrl !== "string" || typeof r.content !== "string") return [];
        try {
          const u = new URL(r.contentUrl);
          if (!isLearn(u)) return [];
          u.hash = "";
          return [{ title: typeof r.title === "string" ? r.title : "", content: r.content, url: u.href }];
        } catch {
          return [];
        }
      });
    } catch {
      /* not this message */
    }
  }
  return [];
}

async function get(
  url: string,
  init: RequestInit,
  max: number
): Promise<{ body: Buffer; finalUrl: string } | null> {
  try {
    const { res, finalUrl } = await safeFetch(url, {
      ...init,
      headers: { "user-agent": "InfiniAIBook training-video pictures", ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok || !isLearn(new URL(finalUrl))) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    return { body: await readCapped(res, max), finalUrl };
  } catch {
    return null;
  }
}

/** Documentation passages for a query, best first. */
export async function searchLearn(query: string): Promise<LearnPassage[]> {
  const r = await get(
    MCP_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "microsoft_docs_search", arguments: { query } },
      }),
    },
    2 * 1024 * 1024
  );
  return r ? parseLearnSearch(r.body.toString("utf8")) : [];
}

/**
 * The best screenshot on Microsoft Learn for `query`, skipping any picture
 * whose URL is in `exclude` so one video does not repeat itself. Null when
 * nothing suitable is found or Learn cannot be reached.
 */
export async function findLearnScreenshot(
  query: string,
  exclude: Set<string> = new Set(),
  pages: Map<string, LearnImage[]> = new Map()
): Promise<(LearnScreenshot & { src: string }) | null> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q) return null;
  const passages = await searchLearn(q);
  const urls = [...new Set(passages.map((p) => p.url))];
  const rank = new Map(urls.map((u, i) => [u, i]));
  const usable = (list: LearnImage[]) => rankLearnImages(list, q, rank).filter((x) => !exclude.has(x.src));

  let candidates = usable(passageImages(passages));
  if (!candidates.length) {
    // The passages are excerpts; the top articles usually have more screenshots.
    const found = await Promise.all(
      urls.slice(0, 2).map(async (u) => {
        const cached = pages.get(u);
        if (cached) return cached;
        const r = await get(u, { headers: { accept: "text/html" } }, MAX_PAGE_BYTES);
        const imgs = r ? parseLearnImages(r.body.toString("utf8"), r.finalUrl).map((x) => ({ ...x, page: u })) : [];
        pages.set(u, imgs);
        return imgs;
      })
    );
    candidates = usable(found.flat());
  }

  for (const img of candidates.slice(0, 4)) {
    const r = await get(img.src, { headers: { accept: "image/png,image/jpeg" } }, MAX_IMAGE_BYTES);
    if (!r) continue;
    const size = imageSize(r.body);
    if (!size || size.width < MIN_WIDTH || size.height < MIN_HEIGHT) continue;
    // Tall scrolling captures and thin toolbars read badly on a slide.
    const aspect = size.width / size.height;
    if (aspect < 0.6 || aspect > 3.2) continue;
    return { bytes: r.body, ...size, alt: img.alt, page: img.page, src: img.src };
  }
  return null;
}
