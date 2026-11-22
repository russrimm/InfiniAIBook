/**
 * CI gate for production dependency advisories.
 *
 * Run with: npx tsx scripts/audit-gate.ts
 *
 * Runs `npm audit --omit=dev --json` and fails when a high or critical
 * advisory is present in a production dependency, unless the advisory is in the
 * reviewed allow-list (.github/audit-allowlist.json) and that entry has not
 * expired. Three outcomes are kept apart:
 *
 *  - an advisory result: the report lists vulnerabilities, so the gate passes or fails on them;
 *  - the audit could not run (registry unreachable, rate limited, audit endpoint
 *    down): a warning annotation and a pass, so an outage on the registry's side
 *    cannot block every merge;
 *  - the audit was misused or its output is not understood (no lockfile, output
 *    that is not JSON): a failure, so the gate cannot go quiet by accident.
 *
 * Exceptions expire so that they are revisited: each has a reason and an
 * `expires` date no more than 90 days ahead.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const MAX_EXCEPTION_DAYS = 90;
const BLOCKING = new Set(["high", "critical"]);
/** Error codes npm reports for a call that was wrong, not for a registry that could not answer. */
const MISUSE_CODES = new Set(["EAUDITNOLOCK", "EAUDITNOPJSON", "EAUDITGLOBAL", "EUSAGE", "EJSONPARSE"]);

export type Exception = { id: string; reason: string; expires: string };

export type Finding = {
  /** GHSA id when the advisory has one, else its numeric id. */
  id: string;
  name: string;
  severity: string;
  title: string;
  url: string;
  range: string;
};

export type Verdict = {
  status: "pass" | "fail" | "unavailable" | "error";
  /** One line saying why. */
  message: string;
  blocked: (Finding & { note?: string })[];
  allowed: (Finding & { expires: string })[];
  /** Entries past their expiry date, whether or not they matched anything. */
  expired: Exception[];
  /** Entries that matched nothing: the advisory is gone and the entry can be deleted. */
  unused: Exception[];
  /** Problems in the allow-list file itself. */
  problems: string[];
};

const GHSA = /^GHSA(?:-[2-9cfghjmpqrvwx]{4}){3}$/i;
const DAY = 24 * 60 * 60 * 1000;

const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

/** Read and check the allow-list. A malformed entry is reported, never silently trusted. */
export function parseAllowlist(raw: unknown, today: Date): { entries: Exception[]; problems: string[] } {
  const problems: string[] = [];
  const entries: Exception[] = [];
  const list = (raw as { exceptions?: unknown } | null)?.exceptions;
  if (!Array.isArray(list)) {
    return { entries, problems: ['The allow-list must be an object with an "exceptions" array.'] };
  }
  const limit = dateOnly(new Date(today.getTime() + MAX_EXCEPTION_DAYS * DAY));
  list.forEach((item, i) => {
    const where = `exceptions[${i}]`;
    const e = item as Partial<Exception> | null;
    const id = typeof e?.id === "string" ? e.id.trim() : "";
    const reason = typeof e?.reason === "string" ? e.reason.trim() : "";
    const expires = typeof e?.expires === "string" ? e.expires.trim() : "";
    if (!GHSA.test(id) && !/^\d{5,}$/.test(id)) {
      problems.push(`${where}: "id" must be a GitHub advisory id such as GHSA-xxxx-xxxx-xxxx.`);
      return;
    }
    if (reason.length < 20) {
      problems.push(`${where} (${id}): "reason" must say why the advisory does not apply or cannot be fixed yet (at least 20 characters).`);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(expires)) || dateOnly(new Date(expires)) !== expires) {
      problems.push(`${where} (${id}): "expires" must be a date written YYYY-MM-DD.`);
      return;
    }
    if (expires > limit) {
      problems.push(`${where} (${id}): "expires" is more than ${MAX_EXCEPTION_DAYS} days away; the latest allowed today is ${limit}.`);
      return;
    }
    entries.push({ id, reason, expires });
  });
  return { entries, problems };
}

type Via = { source?: number; name?: string; title?: string; url?: string; severity?: string; range?: string };
type AuditReport = {
  vulnerabilities?: Record<string, { via?: (string | Via)[] }>;
  error?: { code?: string; summary?: string; detail?: string };
};

/** Every distinct advisory in the report, from the advisory objects (strings in `via` only point at another package). */
export function collectFindings(audit: AuditReport): Finding[] {
  const seen = new Map<string, Finding>();
  for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via === "string") continue;
      const url = via.url ?? "";
      const id = /GHSA(?:-[a-z0-9]{4}){3}/i.exec(url)?.[0] ?? String(via.source ?? `${name}:${via.title ?? "advisory"}`);
      if (seen.has(id.toLowerCase())) continue;
      seen.set(id.toLowerCase(), {
        id,
        name: via.name ?? name,
        severity: String(via.severity ?? "unknown").toLowerCase(),
        title: via.title ?? "Advisory",
        url,
        range: via.range ?? "",
      });
    }
  }
  return [...seen.values()];
}

const result = (status: Verdict["status"], message: string, extra: Partial<Verdict> = {}): Verdict => ({
  status,
  message,
  blocked: [],
  allowed: [],
  expired: [],
  unused: [],
  problems: [],
  ...extra,
});

/** Decide the outcome from npm's JSON output and the allow-list. Pure: no I/O, no clock. */
export function evaluate(stdout: string, allowlist: unknown, today: Date): Verdict {
  const { entries, problems } = parseAllowlist(allowlist, today);

  let audit: AuditReport;
  try {
    audit = JSON.parse(stdout) as AuditReport;
  } catch {
    return result("error", "npm audit did not print JSON, so its result cannot be read.", { problems });
  }

  if (audit.error) {
    const code = audit.error.code ?? "unknown";
    const detail = audit.error.summary ?? audit.error.detail ?? "no detail";
    if (MISUSE_CODES.has(code)) return result("error", `npm audit refused to run (${code}): ${detail}`, { problems });
    return result("unavailable", `npm audit could not reach the registry (${code}): ${detail}`, { problems });
  }
  if (!audit.vulnerabilities || typeof audit.vulnerabilities !== "object") {
    return result("error", "npm audit's JSON has no vulnerabilities section, so its result cannot be read.", { problems });
  }

  const todayKey = dateOnly(today);
  const live = entries.filter((e) => e.expires >= todayKey);
  const expired = entries.filter((e) => e.expires < todayKey);
  const matches = (list: Exception[], f: Finding) => list.find((e) => e.id.toLowerCase() === f.id.toLowerCase());

  const used = new Set<Exception>();
  const blocked: Verdict["blocked"] = [];
  const allowed: Verdict["allowed"] = [];
  for (const f of collectFindings(audit)) {
    if (!BLOCKING.has(f.severity)) continue;
    const ok = matches(live, f);
    if (ok) {
      used.add(ok);
      allowed.push({ ...f, expires: ok.expires });
      continue;
    }
    const stale = matches(expired, f);
    if (stale) used.add(stale);
    blocked.push(stale ? { ...f, note: `its exception expired on ${stale.expires}` } : f);
  }
  const unused = entries.filter((e) => !used.has(e));

  const base = { blocked, allowed, expired, unused, problems };
  if (problems.length) return result("error", "The audit allow-list has problems.", base);
  if (blocked.length) {
    return result("fail", `${blocked.length} high or critical advisory(ies) in production dependencies.`, base);
  }
  const note = allowed.length ? ` (${allowed.length} allowed by exception)` : "";
  return result("pass", `No unreviewed high or critical advisories in production dependencies${note}.`, base);
}

/** The lines to print, with GitHub annotations for what needs a person. */
export function describe(v: Verdict): string[] {
  const out: string[] = [];
  for (const p of v.problems) out.push(`::error file=.github/audit-allowlist.json::${p}`);
  for (const f of v.blocked) {
    out.push(
      `::error::${f.severity.toUpperCase()} ${f.name}${f.range ? ` (${f.range})` : ""}: ${f.title} ${f.url}${f.note ? ` (${f.note})` : ""}`,
    );
  }
  for (const f of v.allowed) out.push(`::notice::Allowed until ${f.expires}: ${f.name} ${f.id} (${f.title})`);
  for (const e of v.expired) {
    out.push(`::warning file=.github/audit-allowlist.json::The exception for ${e.id} expired on ${e.expires}; fix the dependency or renew the exception after a review.`);
  }
  for (const e of v.unused) {
    if (!v.expired.includes(e)) out.push(`::notice file=.github/audit-allowlist.json::The exception for ${e.id} matches nothing any more; delete it.`);
  }
  if (v.status === "unavailable") out.push(`::warning::${v.message} The gate was skipped; it runs again on the next push.`);
  else if (v.status === "pass") out.push(v.message);
  else out.push(`::error::${v.message}`);
  if (v.blocked.length) {
    out.push(
      "Update the dependency, or add a reviewed exception to .github/audit-allowlist.json (id, reason, expires within " +
        `${MAX_EXCEPTION_DAYS} days). See CONTRIBUTING.md.`,
    );
  }
  return out;
}

function runAudit(): string {
  // The arguments are fixed. The shell is only there so `npm` resolves to npm.cmd on Windows.
  const r = spawnSync("npm audit --omit=dev --json", { encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  return r.stdout ?? "";
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main(): number {
  const file = path.join(process.cwd(), ".github", "audit-allowlist.json");
  let allowlist: unknown = { exceptions: [] };
  if (fs.existsSync(file)) {
    try {
      allowlist = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.log(`::error file=.github/audit-allowlist.json::The allow-list is not valid JSON: ${(e as Error).message}`);
      return 1;
    }
  }

  const today = new Date();
  let verdict = evaluate(runAudit(), allowlist, today);
  // A registry that did not answer is retried before the gate is skipped.
  for (const wait of [5_000, 15_000]) {
    if (verdict.status !== "unavailable") break;
    console.log(`${verdict.message} Retrying in ${wait / 1000} seconds.`);
    sleep(wait);
    verdict = evaluate(runAudit(), allowlist, today);
  }

  for (const line of describe(verdict)) console.log(line);
  return verdict.status === "fail" || verdict.status === "error" ? 1 : 0;
}

// Run only when started from the command line, not when a test imports the functions.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  process.exit(main());
}
