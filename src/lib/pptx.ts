import * as cheerio from "cheerio";
import JSZip from "jszip";

/** Placeholders that repeat on every slide and carry no content. */
const CHROME_PLACEHOLDERS = new Set(["sldNum", "dt", "ftr", "hdr", "sldImg"]);

const TITLE_PLACEHOLDERS = new Set(["title", "ctrTitle"]);

/** Resolve an OPC relationship target against the folder of the part that owns it. */
export function resolvePartPath(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir ? baseDir.split("/") : [];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function relsPathFor(part: string): string {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

async function readXml(zip: JSZip, path: string): Promise<cheerio.CheerioAPI | null> {
  const file = zip.file(path);
  if (!file) return null;
  return cheerio.load(await file.async("string"), { xml: true });
}

/** Relationship id → resolved part path, for one part. */
async function relationships(
  zip: JSZip,
  part: string
): Promise<{ id: string; type: string; target: string }[]> {
  const $ = await readXml(zip, relsPathFor(part));
  if (!$) return [];
  return $("Relationship")
    .toArray()
    .filter((el) => $(el).attr("TargetMode") !== "External")
    .map((el) => ({
      id: $(el).attr("Id") ?? "",
      type: $(el).attr("Type") ?? "",
      target: resolvePartPath(dirOf(part), $(el).attr("Target") ?? ""),
    }));
}

/** Slide parts in presentation order, falling back to their file numbering. */
async function slideOrder(zip: JSZip): Promise<string[]> {
  const pres = await readXml(zip, "ppt/presentation.xml");
  if (pres) {
    const rels = new Map(
      (await relationships(zip, "ppt/presentation.xml")).map((r) => [r.id, r.target])
    );
    const ordered = pres("p\\:sldIdLst > p\\:sldId")
      .toArray()
      .map((el) => rels.get(pres(el).attr("r:id") ?? ""))
      .filter((p): p is string => !!p && !!zip.file(p));
    if (ordered.length) return ordered;
  }
  const num = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => num(a) - num(b));
}

/** Text of one paragraph, keeping soft line breaks and tabs. */
function paragraphText($: cheerio.CheerioAPI, p: Parameters<cheerio.CheerioAPI>[0]): string {
  let out = "";
  $(p)
    .find("a\\:r > a\\:t, a\\:fld > a\\:t, a\\:br, a\\:tab")
    .each((_, el) => {
      const tag = (el as { name?: string }).name;
      if (tag === "a:br") out += "\n";
      else if (tag === "a:tab") out += "\t";
      else out += $(el).text();
    });
  return out.replace(/[ \t]+/g, " ").trim();
}

/**
 * Title and body lines of a slide or notes page. Shapes and table rows are
 * read in document order; repeated chrome (slide number, date, footer) is
 * skipped.
 */
function readShapes($: cheerio.CheerioAPI): { title: string; lines: string[] } {
  let title = "";
  const lines: string[] = [];
  $("p\\:txBody, a\\:tr").each((_, body) => {
    if ((body as { name?: string }).name === "a:tr") {
      const cells = $(body)
        .children("a\\:tc")
        .toArray()
        .map((tc) =>
          $(tc)
            .find("a\\:txBody > a\\:p")
            .toArray()
            .map((p) => paragraphText($, p))
            .filter(Boolean)
            .join(" ")
        );
      if (cells.some(Boolean)) lines.push(cells.join(" | "));
      return;
    }
    const sp = $(body).closest("p\\:sp");
    const ph = sp.find("p\\:nvSpPr p\\:ph").first();
    const type = ph.attr("type") ?? "";
    if (CHROME_PLACEHOLDERS.has(type)) return;
    const paras = $(body)
      .children("a\\:p")
      .toArray()
      .map((p) => paragraphText($, p))
      .filter(Boolean);
    if (!paras.length) return;
    if (!title && TITLE_PLACEHOLDERS.has(type)) title = paras.join(" ");
    else lines.push(...paras);
  });
  return { title, lines };
}

/**
 * Pull readable text out of a PowerPoint deck: each slide's title and text in
 * presentation order, followed by its speaker notes.
 */
export async function pptxToText(buf: Buffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const slides = await slideOrder(zip);
  const blocks: string[] = [];

  for (const [i, slidePath] of slides.entries()) {
    const $ = await readXml(zip, slidePath);
    if (!$) continue;
    const { title, lines } = readShapes($);

    let notes: string[] = [];
    const notesPart = (await relationships(zip, slidePath)).find((r) =>
      r.type.endsWith("/notesSlide")
    );
    if (notesPart) {
      const n$ = await readXml(zip, notesPart.target);
      if (n$) {
        const read = readShapes(n$);
        notes = [read.title, ...read.lines].filter(Boolean);
      }
    }

    if (!title && !lines.length && !notes.length) continue;
    const head = `Slide ${i + 1}${title ? `: ${title}` : ""}`;
    const block = [head, ...lines];
    if (notes.length) block.push(`Speaker notes: ${notes.join("\n")}`);
    blocks.push(block.join("\n"));
  }

  return blocks.join("\n\n");
}
