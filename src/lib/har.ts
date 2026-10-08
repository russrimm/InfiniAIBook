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
  serverTiming: { name: string; dur: number }[];
  cacheControl: string;
  /** ETag or Last-Modified present, so the browser can revalidate. */
  validators: boolean;
  thirdParty: boolean;
  /** The URL carries a token, key or password in its query string. */
  secretInUrl: boolean;
  hasAuth: boolean;
  hasCookies: boolean;
};

export type Finding = {
  severity: "high" | "medium" | "low" | "info";
  text: string;
  /** Indexes of the requests the finding is about. */
  requests: number[];
};

export type ServerTimingStat = { name: string; count: number; avg: number; max: number };

export type HarPage = {
  id: string;
  title: string;
  startedDateTime: string;
  /** Milliseconds from the first request's start. */
  offset: number;
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
  findings: Finding[];
  serverTiming: ServerTimingStat[];
  /** Each chain is the indexes of consecutive redirecting requests plus the final response. */
  redirectChains: number[][];
  duplicates: { key: string; count: number; requests: number[] }[];
  sensitive: { authorization: number; cookies: number; urlSecrets: number };
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
    serverTiming: parseServerTiming(header(res.headers, "server-timing")),
    cacheControl: header(res.headers, "cache-control") || (header(res.headers, "expires") ? "expires" : ""),
    validators: !!(header(res.headers, "etag") || header(res.headers, "last-modified")),
    thirdParty: false,
    secretInUrl: hasSecretParam(url),
    hasAuth: !!(header(req.headers, "authorization") || header(req.headers, "x-api-key")),
    hasCookies: arr(req.cookies).length > 0 || !!header(req.headers, "cookie"),
  };
}

/** `db;dur=53, app;dur=47.2;desc="x"` */
export function parseServerTiming(value: string): { name: string; dur: number }[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => {
      const [name, ...params] = part.split(";").map((s) => s.trim());
      const dur = params.find((p) => p.toLowerCase().startsWith("dur="));
      return { name, dur: dur ? Number(dur.slice(4)) : NaN };
    })
    .filter((t) => t.name && Number.isFinite(t.dur));
}

export const SECRET_PARAM = /(^|[_-])(token|access_token|id_token|api[_-]?key|apikey|key|secret|password|passwd|pwd|sig|signature|auth|session|sessionid|code)($|[_-])/i;

function hasSecretParam(url: string): boolean {
  try {
    for (const k of new URL(url).searchParams.keys()) if (SECRET_PARAM.test(k)) return true;
  } catch {
    /* relative or malformed URL */
  }
  return false;
}

/** Naive registrable domain: good enough to tell first party from third. */
const site = (host: string) => host.replace(/:\d+$/, "").split(".").slice(-2).join(".");

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
      offset: Number.isFinite(Date.parse(str(o.startedDateTime))) && Number.isFinite(t0) ? Math.max(0, Date.parse(str(o.startedDateTime)) - t0) : 0,
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

  const n = requests.length;
  const firstParty = site((requests.find((r) => r.category === "document") ?? requests[0])?.host ?? "");
  for (const r of requests) r.thirdParty = !!firstParty && !!r.host && site(r.host) !== firstParty;

  const findings: Finding[] = [];
  const add = (severity: Finding["severity"], text: string, list: HarRequest[] = []) =>
    findings.push({ severity, text, requests: list.map((r) => r.index).slice(0, 50) });
  const where = (r: HarRequest) => `${r.host}${r.path.slice(0, 60)}`;

  const failed = requests.filter((r) => r.failed);
  if (failed.length) {
    const server = failed.filter((r) => r.status >= 500);
    const limited = failed.filter((r) => r.status === 429);
    add("high", `${failed.length} of ${n} requests failed (status 0 or 4xx/5xx).`, failed);
    if (server.length) add("high", `${server.length} requests got a 5xx server error.`, server);
    if (limited.length) add("high", `${limited.length} requests were rate limited (429).`, limited);
    const blocked = failed.filter((r) => r.status === 401 || r.status === 403);
    if (blocked.length) add("medium", `${blocked.length} requests were rejected as unauthorized or forbidden (401/403).`, blocked);
    const lost = failed.filter((r) => r.status === 0);
    if (lost.length) {
      add("medium", `${lost.length} requests have no response (status 0): blocked, aborted, offline or CORS failures.`, lost);
    }
  }
  const preflight = requests.filter((r) => r.method.toUpperCase() === "OPTIONS" && r.failed);
  if (preflight.length) add("high", `${preflight.length} CORS preflight (OPTIONS) requests failed.`, preflight);

  const insecure = requests.filter((r) => r.scheme === "http");
  if (insecure.length) {
    const secure = requests.some((r) => r.scheme === "https");
    add(secure ? "high" : "medium", `${insecure.length} requests used plain HTTP${secure ? " on a page that also uses HTTPS (mixed content)" : ""}.`, insecure);
  }

  const urlSecrets = requests.filter((r) => r.secretInUrl);
  if (urlSecrets.length) add("high", `${urlSecrets.length} URLs carry a token, key or password in the query string; these leak into logs and referrers.`, urlSecrets);

  const slowTtfb = requests.filter((r) => r.phases.wait > 600 && r.status >= 200 && r.status < 400);
  if (slowTtfb.length) add("medium", `${slowTtfb.length} requests waited over 600 ms for the server's first byte.`, slowTtfb.sort((a, b) => b.phases.wait - a.phases.wait));
  const slowConnect = requests.filter((r) => r.phases.dns + r.phases.connect + r.phases.ssl > 500);
  if (slowConnect.length) add("medium", `${slowConnect.length} requests spent over 500 ms on DNS, connection or TLS setup.`, slowConnect);
  const queued = requests.filter((r) => r.phases.blocked > 300);
  if (queued.length) add("medium", `${queued.length} requests were queued or blocked for over 300 ms (connection limits or priorities).`, queued);

  const uncompressed = requests.filter(
    (r) => !r.compressed && compressibleTypes.has(r.category) && r.size > 1024 && r.status === 200
  );
  if (uncompressed.length) add("medium", `${uncompressed.length} text responses over 1 KB were sent without compression.`, uncompressed);

  const staticTypes = new Set(["script", "style", "image", "font"]);
  const uncached = requests.filter(
    (r) => staticTypes.has(r.category) && r.status === 200 && !r.cacheControl && !r.validators && r.size > 0
  );
  if (uncached.length) add("medium", `${uncached.length} static files have no Cache-Control, Expires, ETag or Last-Modified headers.`, uncached);
  const noStore = requests.filter((r) => staticTypes.has(r.category) && /no-store|max-age=0/i.test(r.cacheControl));
  if (noStore.length) add("low", `${noStore.length} static files are marked no-store or max-age=0, so they are never reused.`, noStore);

  const bigImages = requests.filter((r) => r.category === "image" && (r.transfer || r.size) > 500 * 1024);
  if (bigImages.length) add("medium", `${bigImages.length} images are over 500 KB; resize or use a modern format such as WebP or AVIF.`, bigImages);
  const bigScripts = requests.filter((r) => r.category === "script" && (r.transfer || r.size) > 300 * 1024);
  if (bigScripts.length) add("low", `${bigScripts.length} scripts are over 300 KB.`, bigScripts);

  const redirects = requests.filter((r) => r.redirectTo);
  if (redirects.length) add("low", `${redirects.length} requests were redirects; each adds a round trip.`, redirects);

  const byUrl = new Map<string, HarRequest[]>();
  for (const r of requests) {
    if (r.method.toUpperCase() !== "GET") continue;
    byUrl.set(r.url, [...(byUrl.get(r.url) ?? []), r]);
  }
  const duplicates = [...byUrl.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, count: list.length, requests: list.map((r) => r.index) }))
    .sort((a, b) => b.count - a.count);
  const dupCount = duplicates.reduce((s, d) => s + d.count - 1, 0);
  if (dupCount > 0) {
    add("low", `${dupCount} GET requests repeated a URL already requested (${duplicates.length} distinct URLs).`, duplicates.flatMap((d) => d.requests.map((i) => requests[i])));
  }

  const h1 = requests.filter((r) => /^http\/1/i.test(r.httpVersion));
  const h1Hosts = new Map<string, number>();
  for (const r of h1) h1Hosts.set(r.host, (h1Hosts.get(r.host) ?? 0) + 1);
  const crowded = [...h1Hosts.entries()].filter(([, c]) => c > 20);
  if (crowded.length) add("low", `${crowded.map(([h, c]) => `${h} (${c})`).join(", ")} served many requests over HTTP/1.x; HTTP/2 would multiplex them.`);

  const phaseTotal = Object.values(phases).reduce((s, v) => s + v, 0);
  if (phaseTotal > 0 && phases.wait / phaseTotal > 0.5) {
    add("medium", `${Math.round((phases.wait / phaseTotal) * 100)}% of request time was spent waiting for the server's first byte.`);
  }
  const outside = requests.filter((r) => r.thirdParty);
  if (outside.length && outside.length / n > 0.3) {
    add("info", `${Math.round((outside.length / n) * 100)}% of requests (${outside.length}) went to third-party hosts.`, outside);
  }
  const hosts = byCount(host);
  if (hosts.length > 1) add("info", `Requests went to ${hosts.length} hosts; the busiest is ${hosts[0].key} (${hosts[0].count}).`);
  if (largest.length) {
    const big = requests[largest[0]];
    add("info", `Largest response: ${fmtBytes(big.transfer || big.size)} from ${where(big)}.`, [big]);
  }
  if (slowest.length && requests[slowest[0]].time > 0) {
    const slow = requests[slowest[0]];
    add("info", `Slowest request took ${Math.round(slow.time)} ms: ${where(slow)}.`, [slow]);
  }
  const noType = requests.filter((r) => !r.mime && r.status >= 200 && r.status < 300);
  if (noType.length) add("low", `${noType.length} successful responses have no content type.`, noType);

  const sensitive = {
    authorization: requests.filter((r) => r.hasAuth).length,
    cookies: requests.filter((r) => r.hasCookies).length,
    urlSecrets: urlSecrets.length,
  };
  if (sensitive.authorization || sensitive.cookies) {
    add("info", `This archive contains ${sensitive.authorization} requests with credentials and ${sensitive.cookies} with cookies. Download the sanitized copy before sharing it.`);
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  const timingMap = new Map<string, { sum: number; max: number; count: number }>();
  for (const r of requests) {
    for (const t of r.serverTiming) {
      const s = timingMap.get(t.name) ?? { sum: 0, max: 0, count: 0 };
      s.sum += t.dur;
      s.max = Math.max(s.max, t.dur);
      s.count++;
      timingMap.set(t.name, s);
    }
  }
  const serverTiming: ServerTimingStat[] = [...timingMap.entries()]
    .map(([name, s]) => ({ name, count: s.count, avg: s.sum / s.count, max: s.max }))
    .sort((a, b) => b.avg * b.count - a.avg * a.count);

  const redirectChains: number[][] = [];
  const byRequestUrl = new Map(requests.map((r) => [r.url, r]));
  const inChain = new Set<number>();
  for (const r of requests) {
    if (!r.redirectTo || inChain.has(r.index)) continue;
    const chain = [r.index];
    let cur: HarRequest | undefined = r;
    while (cur?.redirectTo && chain.length < 10) {
      let next: HarRequest | undefined;
      try {
        next = byRequestUrl.get(new URL(cur.redirectTo, cur.url).href);
      } catch {
        next = undefined;
      }
      if (!next || chain.includes(next.index)) break;
      chain.push(next.index);
      cur = next;
    }
    chain.forEach((i) => inChain.add(i));
    redirectChains.push(chain);
  }
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
    serverTiming,
    redirectChains,
    duplicates,
    sensitive,
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
