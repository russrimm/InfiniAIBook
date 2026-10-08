import { describe, expect, it } from "vitest";
import { analyze, parseForExplore } from "@/lib/explore";
import { parseServerTiming, summarizeHar } from "@/lib/har";
import { redactText, redactUrl, sanitizeHar } from "@/lib/harsafe";
import { buildDigest, normalizeDiagnosis } from "@/lib/hardiagnose";

const entry = (over: Record<string, unknown>) => ({
  startedDateTime: "2024-06-19T08:54:12.000Z",
  time: 100,
  request: { method: "GET", url: "https://app.example.com/", headers: [], queryString: [], cookies: [] },
  response: { status: 200, statusText: "OK", headers: [], content: { size: 100, mimeType: "text/html" }, bodySize: 100 },
  timings: { wait: 80, receive: 20 },
  ...over,
});

const har = {
  log: {
    version: "1.2",
    pages: [{ id: "p1", title: "Home", startedDateTime: "2024-06-19T08:54:12.000Z", pageTimings: { onContentLoad: 300, onLoad: 900 } }],
    entries: [
      entry({}),
      entry({
        startedDateTime: "2024-06-19T08:54:12.100Z",
        request: {
          method: "GET",
          url: "http://app.example.com/old?access_token=abc123&x=1",
          headers: [{ name: "Authorization", value: "Bearer eyJhbGciOi.eyJzdWIiOi.sig" }],
          queryString: [{ name: "access_token", value: "abc123" }],
          cookies: [{ name: "sid", value: "secret" }],
        },
        response: {
          status: 301,
          headers: [{ name: "Location", value: "https://app.example.com/new" }],
          redirectURL: "https://app.example.com/new",
          content: { size: 0 },
          bodySize: 0,
        },
      }),
      entry({
        startedDateTime: "2024-06-19T08:54:12.200Z",
        request: { method: "GET", url: "https://app.example.com/new", headers: [], queryString: [] },
        response: {
          status: 500,
          headers: [
            { name: "Server-Timing", value: "db;dur=900, app;dur=40.5;desc=x" },
            { name: "Content-Type", value: "application/json" },
          ],
          content: { size: 60, mimeType: "application/json", text: '{"error":"db down","password":"hunter2","email":"a@b.com"}' },
          bodySize: 60,
        },
        timings: { wait: 1500, receive: 10 },
        time: 1510,
      }),
      entry({
        startedDateTime: "2024-06-19T08:54:12.300Z",
        request: { method: "GET", url: "https://cdn.other.net/app.js", headers: [], queryString: [] },
        response: { status: 200, headers: [], content: { size: 90000, mimeType: "application/javascript" }, bodySize: 90000 },
      }),
    ],
  },
};

describe("har findings", () => {
  const s = summarizeHar(har);
  const texts = s.findings.map((f) => f.text).join("\n");

  it("flags failures, mixed content, URL secrets and missing caching, most severe first", () => {
    expect(s.findings[0].severity).toBe("high");
    expect(texts).toMatch(/5xx/);
    expect(texts).toMatch(/plain HTTP/);
    expect(texts).toMatch(/token, key or password/);
    expect(texts).toMatch(/no Cache-Control/);
    expect(texts).toMatch(/without compression/);
    expect(s.findings.find((f) => /5xx/.test(f.text))!.requests).toEqual([2]);
  });

  it("follows redirect chains and parses Server-Timing", () => {
    expect(s.redirectChains).toEqual([[1, 2]]);
    expect(parseServerTiming('db;dur=53, app;dur=47.2;desc="x", bad')).toEqual([
      { name: "db", dur: 53 },
      { name: "app", dur: 47.2 },
    ]);
    expect(s.serverTiming[0]).toMatchObject({ name: "db", max: 900 });
  });

  it("marks third-party hosts, page milestones and credentials", () => {
    expect(s.requests[3].thirdParty).toBe(true);
    expect(s.requests[0].thirdParty).toBe(false);
    expect(s.pages[0]).toMatchObject({ offset: 0, onLoad: 900 });
    expect(s.sensitive).toMatchObject({ authorization: 1, urlSecrets: 1 });
  });
});

describe("redaction", () => {
  it("removes secrets from text and URLs", () => {
    const t = redactText('Bearer abc.def password=hunter2 {"token":"xyz"} a@b.com eyJhbGciOi.eyJzdWIiOi.sig');
    expect(t).not.toMatch(/hunter2|xyz|a@b\.com|abc\.def|eyJ/);
    expect(redactUrl("https://u:p@x.com/a?access_token=abc&keep=1")).toBe("https://x.com/a?access_token=[redacted]&keep=1");
  });

  it("sanitizes a whole archive without mutating it", () => {
    const out = JSON.stringify(sanitizeHar(har));
    expect(out).not.toMatch(/abc123|secret|hunter2|a@b\.com|eyJhbGciOi/);
    expect(out).toContain("/old?access_token=[redacted]");
    expect(JSON.stringify(har)).toContain("hunter2");
  });
});

describe("diagnosis", () => {
  it("builds a digest that cites request numbers and hides secrets", () => {
    const { data } = parseForExplore(JSON.stringify(har), "har");
    const digest = buildDigest(summarizeHar(data), data, "checkout hangs, token=abcdef");
    expect(digest).toMatch(/#3 GET .*500/);
    expect(digest).toMatch(/REPORTED PROBLEM/);
    expect(digest).not.toMatch(/hunter2|abc123|a@b\.com|eyJhbGciOi|abcdef/);
  });

  it("keeps only valid request numbers and known levels from model output", () => {
    const d = normalizeDiagnosis(
      {
        summary: " The server fails. ",
        causes: [
          { title: "DB down", severity: "catastrophic", confidence: "high", requests: [3, 99, 3, "x"] },
          { title: "" },
        ],
        observations: ["ok", 5],
      },
      4
    );
    expect(d.summary).toBe("The server fails.");
    expect(d.causes).toHaveLength(1);
    expect(d.causes[0]).toMatchObject({ severity: "medium", confidence: "high", requests: [3] });
    expect(d.observations).toEqual(["ok", "5"]);
  });

  it("still analyzes the archive", () => {
    expect(analyze(JSON.stringify(har), "har").format).toBe("har");
  });
});
