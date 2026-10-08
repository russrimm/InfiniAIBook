/**
 * Structure discovery for JSON, XML and delimited text: walk the data once and
 * summarize every distinct path (how often it occurs, which types and values it
 * holds) so the shape of a large file is visible without reading it.
 */
import * as cheerio from "cheerio";

export type ValueType = "object" | "array" | "string" | "number" | "boolean" | "null";

export type FieldStat = {
  /** `$.log.entries[].request.url`: arrays contribute `[]`, not an index. */
  path: string;
  parent: string | null;
  key: string;
  depth: number;
  count: number;
  types: Partial<Record<ValueType, number>>;
  /** Distinct scalar values seen, capped at DISTINCT_CAP. */
  distinct: number;
  distinctCapped: boolean;
  samples: string[];
  top: [string, number][];
  min?: number;
  max?: number;
  mean?: number;
  /** Array lengths (arrays) or key counts (objects). */
  minSize?: number;
  maxSize?: number;
  maxLength?: number;
  empty: number;
};

export type StructureSummary = {
  nodes: FieldStat[];
  totals: {
    values: number;
    objects: number;
    arrays: number;
    scalars: number;
    paths: number;
    maxDepth: number;
  };
  truncated: boolean;
};

const DISTINCT_CAP = 500;
const MAX_PATHS = 3000;
const SAMPLE_COUNT = 5;
const SAMPLE_CHARS = 120;

type Acc = {
  stat: FieldStat;
  values: Map<string, number>;
  sum: number;
  numbers: number;
};

export function typeOf(v: unknown): ValueType {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  switch (typeof v) {
    case "object":
      return "object";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

const SIMPLE_KEY = /^[A-Za-z_$@#][\w$@#:.-]*$/;

function childPath(path: string, key: string): string {
  return SIMPLE_KEY.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

export function summarizeStructure(root: unknown): StructureSummary {
  const accs = new Map<string, Acc>();
  const totals = { values: 0, objects: 0, arrays: 0, scalars: 0, paths: 0, maxDepth: 0 };
  let truncated = false;

  const acc = (path: string, parent: string | null, key: string, depth: number): Acc | null => {
    let a = accs.get(path);
    if (a) return a;
    if (accs.size >= MAX_PATHS) {
      truncated = true;
      return null;
    }
    a = {
      stat: {
        path,
        parent,
        key,
        depth,
        count: 0,
        types: {},
        distinct: 0,
        distinctCapped: false,
        samples: [],
        top: [],
        empty: 0,
      },
      values: new Map(),
      sum: 0,
      numbers: 0,
    };
    accs.set(path, a);
    return a;
  };

  const record = (a: Acc, value: unknown) => {
    const s = a.stat;
    const t = typeOf(value);
    s.count++;
    s.types[t] = (s.types[t] ?? 0) + 1;
    totals.values++;

    if (t === "object" || t === "array") {
      const size = t === "array" ? (value as unknown[]).length : Object.keys(value as object).length;
      s.minSize = Math.min(s.minSize ?? size, size);
      s.maxSize = Math.max(s.maxSize ?? size, size);
      if (size === 0) s.empty++;
      if (t === "object") totals.objects++;
      else totals.arrays++;
      return;
    }

    totals.scalars++;
    if (t === "null") {
      s.empty++;
      return;
    }
    if (t === "number") {
      const n = value as number;
      if (Number.isFinite(n)) {
        s.min = Math.min(s.min ?? n, n);
        s.max = Math.max(s.max ?? n, n);
        a.sum += n;
        a.numbers++;
      }
    }
    const text = String(value);
    if (text === "") s.empty++;
    s.maxLength = Math.max(s.maxLength ?? 0, text.length);
    const seen = a.values.get(text);
    if (seen !== undefined) {
      a.values.set(text, seen + 1);
    } else if (a.values.size < DISTINCT_CAP) {
      a.values.set(text, 1);
      if (s.samples.length < SAMPLE_COUNT) s.samples.push(text.slice(0, SAMPLE_CHARS));
    } else {
      s.distinctCapped = true;
    }
  };

  const walk = (value: unknown, path: string, parent: string | null, key: string, depth: number) => {
    const a = acc(path, parent, key, depth);
    if (!a) return;
    totals.maxDepth = Math.max(totals.maxDepth, depth);
    record(a, value);
    if (Array.isArray(value)) {
      const elementPath = `${path}[]`;
      for (const item of value) walk(item, elementPath, path, "[]", depth + 1);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, childPath(path, k), path, k, depth + 1);
    }
  };

  // Iterative walking would avoid deep recursion, but data nested thousands
  // deep is not a document; fail soft instead.
  try {
    walk(root, "$", null, "$", 0);
  } catch {
    truncated = true;
  }

  const nodes: FieldStat[] = [];
  for (const a of accs.values()) {
    const s = a.stat;
    s.distinct = a.values.size;
    s.top = [...a.values.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, SAMPLE_COUNT)
      .map(([v, n]) => [v.slice(0, SAMPLE_CHARS), n]);
    if (a.numbers) s.mean = a.sum / a.numbers;
    nodes.push(s);
  }
  totals.paths = nodes.length;
  return { nodes, totals, truncated };
}

type DomNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

/**
 * XML as plain data: attributes become `@name`, text `#text`, and children that
 * repeat become arrays so they read as collections in the summary.
 */
export function xmlToValue(xml: string): unknown {
  const $ = cheerio.load(xml, { xml: true });
  const convert = (el: DomNode): unknown => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(el.attribs ?? {})) out[`@${k}`] = v;
    let text = "";
    for (const child of el.children ?? []) {
      if (child.type === "tag" && child.name) {
        const value = convert(child);
        const prev = out[child.name];
        if (prev === undefined) out[child.name] = value;
        else if (Array.isArray(prev)) prev.push(value);
        else out[child.name] = [prev, value];
      } else if (child.type === "text" || child.type === "cdata") {
        text += child.type === "cdata" ? (child.children ?? []).map((c) => c.data ?? "").join("") : child.data ?? "";
      }
    }
    text = text.trim();
    const keys = Object.keys(out);
    if (!keys.length) return text;
    if (text) out["#text"] = text;
    return out;
  };
  const roots = ($.root().get(0) as unknown as DomNode).children?.filter((c) => c.type === "tag") ?? [];
  const first = roots[0];
  if (!first?.name) throw new Error("No XML element found.");
  return { [first.name]: convert(first) };
}

export type Column = {
  name: string;
  /** Inferred from every non-empty cell. */
  type: "integer" | "number" | "boolean" | "date" | "string" | "empty";
  filled: number;
  empty: number;
  distinct: number;
  distinctCapped: boolean;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  top: [string, number][];
  samples: string[];
};

export type TableSummary = {
  delimiter: string;
  rows: number;
  columns: Column[];
  preview: string[][];
  /** Rows whose cell count differs from the header. */
  ragged: number;
  duplicateRows: number;
};

export function detectDelimiter(text: string): string | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length < 2) return null;
  let best: { d: string; score: number } | null = null;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = lines.map((l) => splitRow(l, d).length);
    const first = counts[0];
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    if (consistent >= 0.8 && (!best || consistent * first > best.score)) {
      best = { d, score: consistent * first };
    }
  }
  return best?.d ?? null;
}

function splitRow(line: string, d: string): string[] {
  return parseDelimited(line, d)[0] ?? [];
}

/** RFC 4180: quoted cells may hold delimiters, quotes ("") and newlines. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const NUMERIC = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

export function summarizeTable(text: string, delimiter: string): TableSummary {
  const all = parseDelimited(text, delimiter);
  const header = all[0] ?? [];
  const body = all.slice(1);
  const columns: Column[] = header.map((name, ci) => {
    const counts = new Map<string, number>();
    let capped = false;
    let filled = 0;
    const nums: number[] = [];
    let allInt = true;
    let allNum = true;
    let allBool = true;
    let allDate = true;
    for (const r of body) {
      const raw = (r[ci] ?? "").trim();
      if (!raw) continue;
      filled++;
      if (counts.has(raw)) counts.set(raw, counts.get(raw)! + 1);
      else if (counts.size < DISTINCT_CAP) counts.set(raw, 1);
      else capped = true;
      if (NUMERIC.test(raw)) {
        const n = Number(raw);
        nums.push(n);
        if (!Number.isInteger(n) || /[.eE]/.test(raw)) allInt = false;
      } else {
        allNum = false;
        allInt = false;
      }
      if (!/^(true|false|yes|no)$/i.test(raw)) allBool = false;
      if (!DATE_LIKE.test(raw)) allDate = false;
    }
    let type: Column["type"] = "string";
    if (!filled) type = "empty";
    else if (allBool) type = "boolean";
    else if (allInt) type = "integer";
    else if (allNum) type = "number";
    else if (allDate) type = "date";
    const col: Column = {
      name: name.trim() || `column ${ci + 1}`,
      type,
      filled,
      empty: body.length - filled,
      distinct: counts.size,
      distinctCapped: capped,
      top: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, SAMPLE_COUNT)
        .map(([v, n]) => [v.slice(0, SAMPLE_CHARS), n]),
      samples: [...counts.keys()].slice(0, SAMPLE_COUNT).map((v) => v.slice(0, SAMPLE_CHARS)),
    };
    if ((type === "integer" || type === "number") && nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      col.min = sorted[0];
      col.max = sorted[sorted.length - 1];
      col.mean = nums.reduce((s, n) => s + n, 0) / nums.length;
      const mid = Math.floor(sorted.length / 2);
      col.median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return col;
  });

  const seen = new Set<string>();
  let duplicateRows = 0;
  let ragged = 0;
  for (const r of body) {
    if (r.length !== header.length) ragged++;
    const key = r.join("\u0000");
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  return {
    delimiter,
    rows: body.length,
    columns,
    preview: body.slice(0, 50),
    ragged,
    duplicateRows,
  };
}
