/**
 * AI diagnosis of a HAR: build a compact, redacted digest of the archive, ask
 * the model for likely root causes, and validate what comes back so only real
 * request numbers and plain strings reach the UI.
 */
import { isHar, type HarRequest, type HarSummary } from "./har";
import { redactText, redactUrl } from "./harsafe";
import type { ChatMsg } from "./ai";

export type Diagnosis = {
  summary: string;
  causes: {
    title: string;
    severity: "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
    explanation: string;
    evidence: string;
    fix: string;
    /** 1-based, as shown in the Requests table. */
    requests: number[];
  }[];
  observations: string[];
  questions: string[];
};

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Headers that explain behavior; everything else is noise for diagnosis. */
const USEFUL_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-encoding",
  "cache-control",
  "location",
  "retry-after",
  "server",
  "via",
  "www-authenticate",
  "server-timing",
  "age",
  "x-cache",
  "cf-cache-status",
  "x-request-id",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "strict-transport-security",
  "content-security-policy",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);
const USEFUL_REQUEST_HEADERS = new Set([
  "origin",
  "referer",
  "content-type",
  "accept",
  "access-control-request-method",
  "access-control-request-headers",
  "user-agent",
]);

const DIGEST_CHARS = 28_000;
const MAX_SUSPECTS = 25;

function headerLine(headers: unknown, allow: Set<string>): string {
  return arr(headers)
    .map((h) => [str(obj(h).name).toLowerCase(), str(obj(h).value)] as const)
    .filter(([n]) => allow.has(n))
    .map(([n, v]) => `${n}: ${redactText(v).slice(0, 160)}`)
    .join(" | ");
}

const ms = (n: number) => `${Math.round(n)}ms`;

function describe(r: HarRequest, raw: Json | undefined): string {
  const req = obj(raw?.request);
  const res = obj(raw?.response);
  const content = obj(res.content);
  const lines = [
    `#${r.index + 1} ${r.method} ${redactUrl(r.url).slice(0, 200)} -> ${r.status || "no response"} ${r.statusText}`.trim(),
    `  type=${r.mime || "?"} size=${r.size}B transfer=${r.transfer}B total=${ms(r.time)} start=+${ms(r.offset)} ` +
      `blocked=${ms(r.phases.blocked)} dns=${ms(r.phases.dns)} connect=${ms(r.phases.connect)} tls=${ms(r.phases.ssl)} wait=${ms(r.phases.wait)} receive=${ms(r.phases.receive)} http=${r.httpVersion || "?"}`,
  ];
  const rh = headerLine(req.headers, USEFUL_REQUEST_HEADERS);
  if (rh) lines.push(`  request headers: ${rh}`);
  if (r.hasAuth) lines.push("  request carries credentials (values hidden)");
  const resh = headerLine(res.headers, USEFUL_RESPONSE_HEADERS);
  if (resh) lines.push(`  response headers: ${resh}`);
  const post = str(obj(req.postData).text);
  if (post) lines.push(`  request body: ${redactText(post).slice(0, 300)}`);
  const body = str(content.text);
  if ((r.failed || r.status >= 300) && body && content.encoding !== "base64") {
    lines.push(`  response body: ${redactText(body).replace(/\s+/g, " ").slice(0, 600)}`);
  }
  const comment = str(res._error ?? raw?._error);
  if (comment) lines.push(`  error: ${redactText(comment).slice(0, 200)}`);
  return lines.join("\n");
}

export function buildDigest(har: HarSummary, data: unknown, problem: string): string {
  const entries = isHar(data) ? arr(obj(obj(data).log).entries) : [];
  const t = har.totals;
  const parts: string[] = [];

  if (problem.trim()) parts.push(`REPORTED PROBLEM (from the user): ${redactText(problem.trim()).slice(0, 600)}`);
  parts.push(
    `CAPTURE: ${t.requests} requests, wall time ${ms(t.wallTime)}, transferred ${t.transfer}B, ${t.failed} failed, ${t.redirects} redirects, ` +
      `${t.cached} cached, ${t.insecure} plain-HTTP. Recorded by ${har.creator || "unknown"} ${har.browser}.`
  );
  parts.push("PHASE TOTALS: " + Object.entries(har.phases).map(([k, v]) => `${k}=${ms(v)}`).join(" "));
  if (har.pages.length) {
    parts.push(
      "PAGES:\n" +
        har.pages
          .map(
            (p) =>
              `- ${redactUrl(p.title).slice(0, 120)} DOMContentLoaded=${p.onContentLoad ?? "?"}ms load=${p.onLoad ?? "?"}ms requests=${p.requests}`
          )
          .join("\n")
    );
  }
  parts.push("AUTOMATIC FINDINGS:\n" + har.findings.map((f) => `- [${f.severity}] ${f.text}`).join("\n"));
  parts.push("STATUS COUNTS: " + har.byStatus.map((b) => `${b.key}=${b.count}`).join(" "));
  parts.push(
    "TOP HOSTS: " + har.byHost.slice(0, 8).map((b) => `${b.key} (${b.count} req, ${b.bytes}B, ${ms(b.time)})`).join("; ")
  );
  if (har.serverTiming.length) {
    parts.push(
      "SERVER-TIMING: " +
        har.serverTiming.slice(0, 8).map((s) => `${s.name} avg=${ms(s.avg)} max=${ms(s.max)} n=${s.count}`).join("; ")
    );
  }
  if (har.redirectChains.length) {
    parts.push(
      "REDIRECT CHAINS: " +
        har.redirectChains.slice(0, 5).map((c) => c.map((i) => `#${i + 1}`).join(" -> ")).join("; ")
    );
  }

  // Failures first, then the slow and large, then redirects; each request once.
  const picked: number[] = [];
  const take = (list: number[]) => {
    for (const i of list) if (!picked.includes(i) && picked.length < MAX_SUSPECTS) picked.push(i);
  };
  take(har.requests.filter((r) => r.failed).sort((a, b) => b.status - a.status).map((r) => r.index));
  take(har.slowest.slice(0, 6));
  take(har.largest.slice(0, 4));
  take(har.requests.filter((r) => r.redirectTo).map((r) => r.index));
  parts.push(
    "SUSPECT REQUESTS (numbers match the viewer):\n" +
      picked.map((i) => describe(har.requests[i], obj(entries[i]))).join("\n")
  );

  let out = parts.join("\n\n");
  if (out.length > DIGEST_CHARS) out = `${out.slice(0, DIGEST_CHARS)}\n[digest truncated]`;
  return out;
}

export const DIAGNOSIS_SCHEMA_HINT = `{
  "summary": "2-4 sentences: what is going wrong and how bad it is",
  "causes": [
    {
      "title": "short name of the problem",
      "severity": "high | medium | low",
      "confidence": "high | medium | low",
      "explanation": "why this happens, in plain language",
      "evidence": "the specific numbers, headers, statuses or bodies that show it",
      "fix": "concrete action to resolve it",
      "requests": [3, 7]
    }
  ],
  "observations": ["other notable things that are not the main problem"],
  "questions": ["what extra information would confirm or rule out a cause"]
}`;

export function diagnosisMessages(digest: string): ChatMsg[] {
  return [
    {
      role: "system",
      content: [
        "You are a senior web performance and network debugging engineer. You are given a redacted digest of a HAR (HTTP Archive) capture and must work out what is likely causing problems.",
        "Rules:",
        "- Use only evidence in the digest. Never invent requests, headers, numbers or status codes.",
        "- Cite requests by their #number from the digest in each cause's `requests` array.",
        "- Rank causes by impact, most important first, at most 6. Say 'low' confidence when you are inferring.",
        "- If the reported problem is given, address it first. If the capture shows no real problem, say so plainly.",
        "- Look for: failed or rejected requests (401/403/404/429/5xx, status 0), CORS or preflight failures, redirect loops or chains, mixed content, slow server response (wait), DNS/TLS/connection setup, queueing, oversized or uncompressed payloads, missing caching, repeated requests, third-party slowdowns, and error text in response bodies.",
        "- Values shown as [redacted], [jwt] or [email] were hidden on purpose; never ask for them.",
        "- Write in US English.",
        `Reply with JSON only, in this shape:\n${DIAGNOSIS_SCHEMA_HINT}`,
      ].join("\n"),
    },
    { role: "user", content: digest },
  ];
}

const level = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const text = (v: unknown, max: number) => str(v).replace(/\s+/g, " ").trim().slice(0, max);

/** The model's JSON is untrusted: keep known fields, cap lengths, drop invented request numbers. */
export function normalizeDiagnosis(raw: unknown, requestCount: number): Diagnosis {
  const o = obj(raw);
  const causes = arr(o.causes)
    .slice(0, 6)
    .map((c) => {
      const x = obj(c);
      return {
        title: text(x.title, 120),
        severity: level(x.severity, ["high", "medium", "low"] as const, "medium"),
        confidence: level(x.confidence, ["high", "medium", "low"] as const, "medium"),
        explanation: text(x.explanation, 700),
        evidence: text(x.evidence, 500),
        fix: text(x.fix, 500),
        requests: [...new Set(arr(x.requests).map(Number))]
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= requestCount)
          .slice(0, 12),
      };
    })
    .filter((c) => c.title);
  return {
    summary: text(o.summary, 900),
    causes,
    observations: arr(o.observations).map((s) => text(s, 300)).filter(Boolean).slice(0, 8),
    questions: arr(o.questions).map((s) => text(s, 300)).filter(Boolean).slice(0, 5),
  };
}
