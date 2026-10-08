/**
 * HAR (HTTP Archive) analysis: normalize entries, then derive the summaries a
 * network panel shows: totals, breakdowns, slowest/largest requests, timing
 * phases and plain-language findings. Also accepts a plain JSON array of
 * request records (url, method, status, time, size) for tool-specific exports.
 */

export type HarPhases = {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
};

export type HarRequest = {
  index: number;
  page: string | null;
  /** Milliseconds from the first request's start. */
  offset: number;
  method: string;
  url: string;
  host: string;
  path: string;
  scheme: string;
  status: number;
  statusText: string;
  mime: string;
  category: string;
  httpVersion: string;
  /** Decoded body bytes. */
  size: number;
  /** Bytes on the wire (body plus headers) when the archive records them. */
  transfer: number;
  time: number;
  phases: HarPhases;
  serverIp: string;
  cached: boolean;
  redirectTo: string | null;
  compressed: boolean;
  failed: boolean;
};

export type HarPage = {
  id: string;
  title: string;
  startedDateTime: string;
  onContentLoad: number | null;
  onLoad: number | null;
  requests: number;
};

export type Breakdown = { key: string; count: number; bytes: number; time: number };

export type HarSummary = {
  creator: string;
  browser: string;
  version: string;
  requests: HarRequest[];
  pages: HarPage[];
  totals: {
    requests: number;
    /** First request start to last response end. */
    wallTime: number;
    summedTime: number;
    size: number;
    transfer: number;
    failed: number;
    redirects: number;
    cached: number;
    insecure: number;
    uncompressed: number;
  };
  phases: HarPhases;
  byStatus: Breakdown[];
  byMethod: Breakdown[];
  byCategory: Breakdown[];
  byHost: Breakdown[];
  slowest: number[];
  largest: number[];
  findings: string[];
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** HAR uses -1 for "not applicable". */
const ms = (v: unknown): number => Math.max(0, num(v));

export function isHar(data: unknown): boolean {
  return Array.isArray(obj(obj(data).log).entries);
}

/** A bare array of request-like records, e.g. an export from another viewer. */
export function isRequestList(data: unknown): boolean {
  const list = Array.isArray(data) ? data : arr(obj(data).requests);
  return (
    list.length > 0 &&
    list.slice(0, 5).every((r) => {
      const o = obj(r);
      return typeof o.url === "string" || typeof obj(o.request).url === "string";
    })
  );
}

export function categorize(mime: string, path: string): string {
  const m = mime.toLowerCase();
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (m.includes("html") || ext === "html") return "document";
  if (m.includes("css") || ext === "css") return "style";
  if (m.includes("javascript") || m.includes("ecmascript") || ext === "js" || ext === "mjs") return "script";
  if (m.startsWith("image/") || /^(png|jpe?g|gif|webp|svg|ico|avif)$/.test(ext)) return "image";
  if (m.startsWith("font/") || m.includes("font") || /^(woff2?|ttf|otf)$/.test(ext)) return "font";
  if (m.startsWith("video/") || m.startsWith("audio/")) return "media";
  if (m.includes("json") || m.includes("xml") || m.includes("protobuf")) return "data";
  if (!m) return "other";
  return "other";
}

function splitUrl(raw: string) {
  try {
    const u = new URL(raw);
    return { host: u.host, path: `${u.pathname}${u.search}`, scheme: u.protocol.replace(":", "") };
  } catch {
    return { host: "", path: raw, scheme: "" };
  }
}

function header(headers: unknown, name: string): string {
  const want = name.toLowerCase();
  for (const h of arr(headers)) {
    const o = obj(h);
    if (str(o.name).toLowerCase() === want) return str(o.value);
  }
  return "";
}

function normalizeEntry(raw: unknown, index: number, t0: number): HarRequest {
  const e = obj(raw);
  const req = obj(e.request);
  const res = obj(e.response);
  const content = obj(res.content);
  const timings = obj(e.timings);
  const url = str(req.url ?? e.url);
  const { host, path, scheme } = splitUrl(url);
  const mime = str(content.mimeType ?? e.mimeType ?? e.contentType).split(";")[0].trim();
  const status = num(res.status ?? e.status);
  const started = Date.parse(str(e.startedDateTime));

  const phases: HarPhases = {
    blocked: ms(timings.blocked),
    dns: ms(timings.dns),
    // In HAR, ssl is already counted inside connect.
    connect: Math.max(0, ms(timings.connect) - ms(timings.ssl)),
    ssl: ms(timings.ssl),
    send: ms(timings.send),
    wait: ms(timings.wait),
    receive: ms(timings.receive),
  };
  const phaseTotal = Object.values(phases).reduce((s, n) => s + n, 0);
  const time = num(e.time) > 0 ? num(e.time) : phaseTotal;

  const bodySize = num(res.bodySize);
  const contentSize = num(content.size ?? e.size);
  const headersSize = Math.max(0, num(res.headersSize));
  const transfer = num(res._transferSize) || (bodySize > 0 ? bodySize + headersSize : 0);
  const encoding = header(res.headers, "content-encoding");
  const redirect = str(res.redirectURL) || (status >= 300 && status < 400 ? header(res.headers, "location") : "");
  const failed = status === 0 || status >= 400;

  return {
    index,
    page: str(e.pageref) || null,
    offset: Number.isFinite(started) && Number.isFinite(t0) ? Math.max(0, started - t0) : 0,
    method: str(req.method ?? e.method) || "GET",
    url,
    host,
    path,
    scheme,
    status,
    statusText: str(res.statusText ?? e.statusText),
    mime,
    category: categorize(mime, path),
    httpVersion: str(res.httpVersion ?? req.httpVersion ?? e.httpVersion),
    size: Math.max(0, contentSize),
    transfer: Math.max(0, transfer || (status === 304 ? 0 : bodySize > 0 ? bodySize : 0)),
    time,
    phases,
    serverIp: str(e.serverIPAddress),
    cached: status === 304 || (e.cache !== undefined && Object.keys(obj(e.cache)).length > 0 && bodySize === 0 && transfer === 0 && status === 200),
    redirectTo: redirect || null,
    compressed: !!encoding && encoding.toLowerCase() !== "identity",
    failed,
  };
}

function bump(map: Map<string, Breakdown>, key: string, r: HarRequest) {
  const b = map.get(key) ?? { key, count: 0, bytes: 0, time: 0 };
  b.count++;
  b.bytes += r.transfer || r.size;
  b.time += r.time;
  map.set(key, b);
}

const byCount = (m: Map<string, Breakdown>) =>
  [...m.values()].sort((a, b) => b.count - a.count || b.bytes - a.bytes);

const fmtBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

export function summarizeHar(data: unknown): HarSummary {
  const log = obj(obj(data).log);
  const rawEntries = isHar(data) ? arr(log.entries) : Array.isArray(data) ? data : arr(obj(data).requests);
  const starts = rawEntries.map((e) => Date.parse(str(obj(e).startedDateTime))).filter(Number.isFinite);
  const t0 = starts.length ? Math.min(...starts) : NaN;

  const requests = rawEntries.map((e, i) => normalizeEntry(e, i, t0));
  const pages: HarPage[] = arr(log.pages).map((p) => {
    const o = obj(p);
    const timings = obj(o.pageTimings);
    const id = str(o.id);
    const onContent = num(timings.onContentLoad);
    const onLoad = num(timings.onLoad);
    return {
      id,
      title: str(o.title),
      startedDateTime: str(o.startedDateTime),
      onContentLoad: onContent > 0 ? onContent : null,
      onLoad: onLoad > 0 ? onLoad : null,
      requests: requests.filter((r) => r.page === id).length,
    };
  });

  const status = new Map<string, Breakdown>();
  const method = new Map<string, Breakdown>();
  const category = new Map<string, Breakdown>();
  const host = new Map<string, Breakdown>();
  const phases: HarPhases = { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 0, receive: 0 };
  let size = 0;
  let transfer = 0;
  let summed = 0;
  let end = 0;
  const totals = { failed: 0, redirects: 0, cached: 0, insecure: 0, uncompressed: 0 };
  const compressibleTypes = new Set(["document", "style", "script", "data"]);

  for (const r of requests) {
    bump(status, r.status === 0 ? "failed (0)" : `${Math.floor(r.status / 100)}xx`, r);
    bump(method, r.method.toUpperCase(), r);
    bump(category, r.category, r);
    bump(host, r.host || "(unknown)", r);
    for (const k of Object.keys(phases) as (keyof HarPhases)[]) phases[k] += r.phases[k];
    size += r.size;
    transfer += r.transfer;
    summed += r.time;
    end = Math.max(end, r.offset + r.time);
    if (r.failed) totals.failed++;
    if (r.redirectTo) totals.redirects++;
    if (r.cached) totals.cached++;
    if (r.scheme === "http") totals.insecure++;
    if (!r.compressed && compressibleTypes.has(r.category) && r.size > 1024 && r.status === 200) totals.uncompressed++;
  }

  const idx = requests.map((r) => r.index);
  const slowest = [...idx].sort((a, b) => requests[b].time - requests[a].time).slice(0, 10);
  const largest = [...idx]
    .sort((a, b) => (requests[b].transfer || requests[b].size) - (requests[a].transfer || requests[a].size))
    .slice(0, 10);

  const findings: string[] = [];
  const n = requests.length;
  if (totals.failed) findings.push(`${totals.failed} of ${n} requests failed (status 0 or 4xx/5xx).`);
  if (totals.insecure) findings.push(`${totals.insecure} requests used plain HTTP instead of HTTPS.`);
  if (totals.uncompressed) {
    findings.push(`${totals.uncompressed} text responses over 1 KB were sent without compression.`);
  }
  if (totals.redirects) findings.push(`${totals.redirects} requests were redirects; each adds a round trip.`);
  const phaseTotal = Object.values(phases).reduce((s, v) => s + v, 0);
  if (phaseTotal > 0 && phases.wait / phaseTotal > 0.5) {
    findings.push(
      `${Math.round((phases.wait / phaseTotal) * 100)}% of request time was spent waiting for the server's first byte.`
    );
  }
  const hosts = byCount(host);
  if (hosts.length > 1) {
    findings.push(`Requests went to ${hosts.length} hosts; the busiest is ${hosts[0].key} (${hosts[0].count}).`);
  }
  if (largest.length) {
    const big = requests[largest[0]];
    findings.push(`Largest response: ${fmtBytes(big.transfer || big.size)} from ${big.host}${big.path.slice(0, 60)}.`);
  }
  if (slowest.length && requests[slowest[0]].time > 0) {
    const slow = requests[slowest[0]];
    findings.push(`Slowest request took ${Math.round(slow.time)} ms: ${slow.host}${slow.path.slice(0, 60)}.`);
  }
  const noType = requests.filter((r) => !r.mime && r.status >= 200 && r.status < 300).length;
  if (noType) findings.push(`${noType} successful responses have no content type.`);

  return {
    creator: [str(obj(log.creator).name), str(obj(log.creator).version)].filter(Boolean).join(" "),
    browser: str(obj(log.browser).name),
    version: str(log.version),
    requests,
    pages,
    totals: {
      requests: n,
      wallTime: end,
      summedTime: summed,
      size,
      transfer,
      ...totals,
    },
    phases,
    byStatus: byCount(status),
    byMethod: byCount(method),
    byCategory: byCount(category),
    byHost: hosts,
    slowest,
    largest,
    findings,
  };
}

export type HarDetail = {
  index: number;
  request: {
    headers: [string, string][];
    query: [string, string][];
    cookies: [string, string][];
    postData: string;
    postMime: string;
  };
  response: {
    headers: [string, string][];
    cookies: [string, string][];
    body: string;
    bodyTruncated: boolean;
    encoding: string;
  };
};

const pairs = (list: unknown): [string, string][] =>
  arr(list).map((h) => [str(obj(h).name), str(obj(h).value)] as [string, string]);

const BODY_PREVIEW_CHARS = 20_000;

/** Headers, cookies and bodies for one request; too large to ship for all. */
export function harDetail(data: unknown, index: number): HarDetail | null {
  const raw = (isHar(data) ? arr(obj(obj(data).log).entries) : Array.isArray(data) ? data : arr(obj(data).requests))[index];
  if (!raw) return null;
  const e = obj(raw);
  const req = obj(e.request);
  const res = obj(e.response);
  const content = obj(res.content);
  const post = obj(req.postData);
  const text = str(content.text);
  const binary = str(content.encoding) === "base64";
  return {
    index,
    request: {
      headers: pairs(req.headers),
      query: pairs(req.queryString),
      cookies: pairs(req.cookies),
      postData: str(post.text).slice(0, BODY_PREVIEW_CHARS),
      postMime: str(post.mimeType),
    },
    response: {
      headers: pairs(res.headers),
      cookies: pairs(res.cookies),
      body: binary ? "" : text.slice(0, BODY_PREVIEW_CHARS),
      bodyTruncated: !binary && text.length > BODY_PREVIEW_CHARS,
      encoding: binary ? "base64 (binary content not shown)" : "",
    },
  };
}
