import * as cheerio from "cheerio";
import mammoth from "mammoth";

export type Extracted = { title: string; text: string; kind: string };

function clean(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name || "Untitled";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());

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

function htmlToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, svg, iframe, form").remove();
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  const body = $("article").text().trim() || $("main").text().trim() || $("body").text();
  return { title, text: clean(body) };
}

export async function extractFromUrl(url: string): Promise<Extracted> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; OpenNotebook/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status})`);
  const ctype = res.headers.get("content-type") ?? "";

  if (ctype.includes("application/pdf")) {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return { title: url, text: clean(String(text)), kind: "pdf" };
  }

  const raw = await res.text();
  if (ctype.includes("text/html") || raw.trimStart().startsWith("<")) {
    const { title, text } = htmlToText(raw);
    return { title: title || new URL(url).hostname, text, kind: "url" };
  }
  return { title: new URL(url).hostname, text: clean(raw), kind: "url" };
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
