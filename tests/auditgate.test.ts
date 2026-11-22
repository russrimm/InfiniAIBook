import { describe, expect, it } from "vitest";
import {
  MAX_EXCEPTION_DAYS,
  collectFindings,
  describe as describeVerdict,
  evaluate,
  parseAllowlist,
} from "../scripts/audit-gate";

const TODAY = new Date("2026-11-21T12:00:00Z");
const GHSA = "GHSA-cfgh-2345-mpqr";
const OTHER = "GHSA-cccc-hhhh-jjjj";

const advisory = (id: string, severity: string, name = "left-pad") => ({
  source: 1234567,
  name,
  dependency: name,
  title: `Prototype pollution in ${name}`,
  url: `https://github.com/advisories/${id}`,
  severity,
  range: "<1.2.3",
});

/** The JSON `npm audit --json` prints for a tree with these advisories. */
const report = (...advisories: ReturnType<typeof advisory>[]) =>
  JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(
      advisories.map((a) => [a.name, { name: a.name, severity: a.severity, via: [a, "somethingelse"] }]),
    ),
    metadata: {},
  });

const exception = (over: Record<string, unknown> = {}) => ({
  id: GHSA,
  reason: "Only reachable through a build step that never sees untrusted input.",
  expires: "2026-12-31",
  ...over,
});
const allow = (...exceptions: unknown[]) => ({ exceptions });
const none = allow();

describe("evaluate: advisory results", () => {
  it("passes a clean tree and one with only moderate and low advisories", () => {
    expect(evaluate(report(), none, TODAY).status).toBe("pass");
    expect(evaluate(report(advisory(GHSA, "moderate"), advisory(OTHER, "low", "b")), none, TODAY).status).toBe("pass");
  });

  it("fails on a high or critical advisory and names it with its link", () => {
    for (const severity of ["high", "critical"]) {
      const v = evaluate(report(advisory(GHSA, severity)), none, TODAY);
      expect(v.status).toBe("fail");
      expect(v.blocked).toHaveLength(1);
      const lines = describeVerdict(v).join("\n");
      expect(lines).toContain(`::error::${severity.toUpperCase()} left-pad (<1.2.3)`);
      expect(lines).toContain(`https://github.com/advisories/${GHSA}`);
      expect(lines).toContain(".github/audit-allowlist.json");
    }
  });

  it("counts an advisory once however many packages it reaches", () => {
    const a = advisory(GHSA, "high");
    const json = JSON.stringify({
      vulnerabilities: { a: { via: [a] }, b: { via: [a, "a"] }, c: { via: ["a"] } },
    });
    expect(collectFindings(JSON.parse(json))).toHaveLength(1);
    expect(evaluate(json, none, TODAY).blocked).toHaveLength(1);
  });
});

describe("evaluate: the audit could not answer", () => {
  it("is not a failure when the registry is unreachable or rate limited", () => {
    for (const code of ["ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "E429", "E503", "EAI_AGAIN", "ENOAUDIT"]) {
      const v = evaluate(JSON.stringify({ error: { code, summary: "request failed", detail: "" } }), none, TODAY);
      expect(v.status, code).toBe("unavailable");
      expect(describeVerdict(v).join("\n")).toContain("::warning::");
    }
  });

  it("is a failure when the audit was misused or its output is not understood", () => {
    for (const code of ["EAUDITNOLOCK", "EAUDITNOPJSON", "EUSAGE"]) {
      expect(evaluate(JSON.stringify({ error: { code, summary: "x" } }), none, TODAY).status, code).toBe("error");
    }
    expect(evaluate("npm ERR! something", none, TODAY).status).toBe("error");
    expect(evaluate("", none, TODAY).status).toBe("error");
    expect(evaluate(JSON.stringify({ metadata: {} }), none, TODAY).status).toBe("error");
  });
});

describe("the allow-list", () => {
  it("lets a reviewed, unexpired exception through, by GHSA id in any letter case", () => {
    const v = evaluate(report(advisory(GHSA, "high")), allow(exception({ id: GHSA.toLowerCase() })), TODAY);
    expect(v.status).toBe("pass");
    expect(v.allowed).toMatchObject([{ id: GHSA, expires: "2026-12-31" }]);
    expect(describeVerdict(v).join("\n")).toContain("::notice::Allowed until 2026-12-31");
  });

  it("only covers the advisory it names", () => {
    const v = evaluate(report(advisory(GHSA, "high"), advisory(OTHER, "critical", "b")), allow(exception()), TODAY);
    expect(v.status).toBe("fail");
    expect(v.blocked.map((f) => f.id)).toEqual([OTHER]);
  });

  it("stops covering an advisory once the exception expires, and says so", () => {
    const v = evaluate(report(advisory(GHSA, "high")), allow(exception({ expires: "2026-11-20" })), TODAY);
    expect(v.status).toBe("fail");
    expect(v.blocked[0]!.note).toMatch(/expired on 2026-11-20/);
    expect(v.expired).toHaveLength(1);
    expect(describeVerdict(v).join("\n")).toMatch(/expired on 2026-11-20/);
    // It still covers the advisory on its last day.
    expect(evaluate(report(advisory(GHSA, "high")), allow(exception({ expires: "2026-11-21" })), TODAY).status).toBe("pass");
  });

  it("reports an exception that matches nothing so it can be deleted", () => {
    const v = evaluate(report(), allow(exception()), TODAY);
    expect(v.status).toBe("pass");
    expect(v.unused).toHaveLength(1);
    expect(describeVerdict(v).join("\n")).toContain("matches nothing any more");
  });

  it("does not let an exception hide a moderate advisory problem or a different severity", () => {
    const v = evaluate(report(advisory(GHSA, "moderate")), allow(exception()), TODAY);
    expect(v.status).toBe("pass");
    expect(v.allowed).toHaveLength(0);
    expect(v.unused).toHaveLength(1);
  });

  it("refuses a malformed entry rather than trusting it", () => {
    const bad = [
      exception({ id: "left-pad" }),
      exception({ reason: "ok" }),
      exception({ reason: undefined }),
      exception({ expires: "next week" }),
      exception({ expires: "2026-02-30" }),
      exception({ expires: undefined }),
      exception({ expires: "2027-12-31" }),
      null,
    ];
    for (const entry of bad) {
      const v = evaluate(report(advisory(GHSA, "high")), allow(entry), TODAY);
      expect(v.status, JSON.stringify(entry)).toBe("error");
      expect(v.problems.length).toBeGreaterThan(0);
    }
    expect(evaluate(report(), { exceptions: "none" }, TODAY).status).toBe("error");
    expect(evaluate(report(), null, TODAY).status).toBe("error");
  });

  it(`caps an exception at ${MAX_EXCEPTION_DAYS} days`, () => {
    expect(parseAllowlist(allow(exception({ expires: "2027-02-19" })), TODAY).problems).toEqual([]);
    expect(parseAllowlist(allow(exception({ expires: "2027-02-20" })), TODAY).problems[0]).toMatch(/more than 90 days/);
  });
});
