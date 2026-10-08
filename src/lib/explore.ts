import {
  detectDelimiter,
  summarizeStructure,
  summarizeTable,
  xmlToValue,
  type StructureSummary,
  type TableSummary,
} from "./datastruct";
import { JSON_KINDS, TABLE_KINDS, XML_KINDS } from "./explorekinds";
import { harDetail, isHar, isRequestList, summarizeHar, type HarDetail, type HarSummary } from "./har";

export type Analysis =
  | { format: "har"; har: HarSummary; structure: StructureSummary }
  | { format: "json" | "xml"; structure: StructureSummary }
  | { format: "csv" | "tsv"; table: TableSummary };

function parseJson(text: string): unknown {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    return JSON.parse(body);
  } catch (e) {
    // JSON Lines: one value per line.
    const lines = body.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      try {
        return lines.map((l) => JSON.parse(l));
      } catch {
        /* fall through to the original error */
      }
    }
    throw e;
  }
}

function sniff(text: string, kind: string): "json" | "xml" | "table" | null {
  const k = kind.toLowerCase();
  if (JSON_KINDS.has(k)) return "json";
  if (XML_KINDS.has(k)) return "xml";
  if (TABLE_KINDS.has(k)) return "table";
  const head = text.trimStart().charAt(0);
  if (head === "{" || head === "[") return "json";
  if (head === "<") return "xml";
  return detectDelimiter(text) ? "table" : null;
}

/** Parse once and keep the data so detail lookups need no second parse. */
export function parseForExplore(text: string, kind: string): { format: Analysis["format"]; data: unknown } {
  const type = sniff(text, kind);
  if (type === "json") {
    const data = parseJson(text);
    return { format: isHar(data) || isRequestList(data) ? "har" : "json", data };
  }
  if (type === "xml") return { format: "xml", data: xmlToValue(text) };
  if (type === "table") {
    const delimiter = kind.toLowerCase() === "tsv" ? "\t" : detectDelimiter(text) ?? ",";
    return { format: delimiter === "\t" ? "tsv" : "csv", data: text };
  }
  throw new Error("This source is not JSON, XML, HAR, CSV or TSV, so there is no structure to explore.");
}

export function analyze(text: string, kind: string): Analysis {
  const { format, data } = parseForExplore(text, kind);
  if (format === "har") return { format, har: summarizeHar(data), structure: summarizeStructure(data) };
  if (format === "csv" || format === "tsv") {
    return { format, table: summarizeTable(text, format === "tsv" ? "\t" : detectDelimiter(text) ?? ",") };
  }
  return { format, structure: summarizeStructure(data) };
}

export function requestDetail(text: string, kind: string, index: number): HarDetail | null {
  const { format, data } = parseForExplore(text, kind);
  return format === "har" ? harDetail(data, index) : null;
}
