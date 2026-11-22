import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CSP_REPORT_PATH, buildCsp, connectSources, newNonce, scriptHash, themeScriptHash } from "@/lib/csp";
import { bareUrl, formatCspReports } from "@/lib/cspreport";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { proxy } from "@/proxy";
import { POST as report } from "@/app/api/csp-report/route";

const directives = (policy: string) =>
  Object.fromEntries(policy.split("; ").map((d) => [d.split(" ")[0]!, d.split(" ").slice(1)]));

describe("buildCsp", () => {
  const build = (over: Partial<Parameters<typeof buildCsp>[0]> = {}) =>
    buildCsp({ nonce: "bm9uY2U=", themeHash: "'sha256-abc='", dev: false, env: {}, ...over });

  it("lets scripts run only with the request's nonce or the theme script's hash, with no unsafe-inline", () => {
    const d = directives(build());
    expect(d["script-src"]).toEqual(["'nonce-bm9uY2U='", "'sha256-abc='", "'strict-dynamic'"]);
    expect(d["script-src"]).not.toContain("'unsafe-inline'");
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
  });

  it("allows eval and websockets only in development", () => {
    const dev = directives(build({ dev: true }));
    expect(dev["script-src"]).toContain("'unsafe-eval'");
    expect(dev["connect-src"]).toContain("ws:");
    expect(directives(build())["connect-src"]).not.toContain("ws:");
  });

  it("keeps the rest of the enforced policy's restrictions", () => {
    const d = directives(build());
    expect(d["default-src"]).toEqual(["'self'"]);
    expect(d["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'"]);
    expect(d["report-uri"]).toEqual([CSP_REPORT_PATH]);
  });

  it("limits connections to this app plus the configured Speech region, not whole host families", () => {
    expect(connectSources({}, false)).toEqual(["'self'"]);
    expect(connectSources({ AZURE_SPEECH_REGION: "westus2" }, false)).toEqual([
      "'self'",
      "https://westus2.tts.speech.microsoft.com",
      "wss://westus2.tts.speech.microsoft.com",
    ]);
    const policy = build({
      env: { AZURE_SPEECH_REGION: "WestUS2", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com", AI_BASE_URL: "https://llm.example.test/v1" },
    });
    expect(policy).toContain("https://westus2.tts.speech.microsoft.com");
    expect(policy).not.toMatch(/\*\.|openai\.azure\.com|llm\.example\.test/);
  });

  it("ignores a region that is not a plain region name", () => {
    for (const region of ["", "a b", "evil.example/x", "x;y", "*"]) {
      expect(connectSources({ AZURE_SPEECH_REGION: region }, false), region).toEqual(["'self'"]);
    }
  });
});

describe("nonce and hash", () => {
  it("makes a different unguessable nonce each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/=]{40,}$/);
    expect(newNonce()).not.toBe(a);
  });

  it("hashes a script the way a browser does", async () => {
    // sha256("alert(1)") in base64.
    expect(await scriptHash("alert(1)")).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
    expect(await themeScriptHash()).toBe(await scriptHash(THEME_INIT_SCRIPT));
  });
});

describe("proxy and the policy header", () => {
  const ENV_KEYS = ["INFINIAIBOOK_PASSWORD", "ALLOWED_HOSTS", "AZURE_SPEECH_REGION"];
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const call = (path: string, method = "GET") =>
    proxy(new NextRequest(`http://localhost:3000${path}`, { method, headers: { host: "localhost:3000" } }));

  it("sends the report-only policy on a page, with a nonce that is also passed on to Next.js", async () => {
    const res = await call("/notebook/abc");
    const policy = res.headers.get("content-security-policy-report-only")!;
    expect(policy).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+' 'sha256-/);
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
    // Next reads the nonce from the request headers the proxy forwards.
    const forwarded = res.headers.get("x-middleware-override-headers") ?? "";
    expect(forwarded).toContain("content-security-policy-report-only");
    expect(forwarded).toContain("x-nonce");
    const nonce = /'nonce-([^']+)'/.exec(policy)![1];
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
  });

  it("uses a new nonce for every request", async () => {
    const nonce = async () => /'nonce-([^']+)'/.exec((await call("/")).headers.get("content-security-policy-report-only")!)![1];
    expect(await nonce()).not.toBe(await nonce());
  });

  it("puts the configured Speech region in connect-src when the request is made", async () => {
    process.env.AZURE_SPEECH_REGION = "eastus2";
    const policy = (await call("/")).headers.get("content-security-policy-report-only")!;
    expect(policy).toContain("wss://eastus2.tts.speech.microsoft.com");
  });

  it("adds no policy to API responses or refusals", async () => {
    expect((await call("/api/notebooks")).headers.get("content-security-policy-report-only")).toBeNull();
    process.env.INFINIAIBOOK_PASSWORD = "correct horse";
    const refused = await call("/api/notebooks");
    expect(refused.status).toBe(401);
    expect(refused.headers.get("content-security-policy-report-only")).toBeNull();
  });
});

describe("report lines", () => {
  it("reads the legacy report shape", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "http://localhost:3000/notebook/abc?token=secret#x",
        "effective-directive": "script-src-elem",
        "blocked-uri": "inline",
        "source-file": "http://localhost:3000/_next/static/chunks/main.js?v=1",
        "line-number": 12,
        "script-sample": "alert('secret')",
      },
    });
    const [line] = formatCspReports(body);
    expect(line).toBe(
      "[csp] report-only: script-src-elem would block inline in http://localhost:3000/_next/static/chunks/main.js:12 on http://localhost:3000/notebook/abc",
    );
    expect(line).not.toMatch(/secret/);
  });

  it("reads the Reporting API shape, several to a body", () => {
    const body = JSON.stringify([
      { type: "csp-violation", body: { documentURL: "http://a.test/p", effectiveDirective: "connect-src", blockedURL: "https://evil.test/x?y=1" } },
      { type: "csp-violation", body: { documentURL: "http://a.test/p", effectiveDirective: "img-src", blockedURL: "data:image/png;base64,AAAA" } },
      { type: "network-error", body: {} },
    ]);
    expect(formatCspReports(body)).toEqual([
      "[csp] report-only: connect-src would block https://evil.test/x on http://a.test/p",
      "[csp] report-only: img-src would block data:… on http://a.test/p",
    ]);
  });

  it("drops anything unreadable and keeps queries out of addresses", () => {
    for (const raw of ["", "not json", "null", "[1,2]", '{"csp-report":{}}']) expect(formatCspReports(raw), raw).toEqual([]);
    expect(bareUrl("https://x.test/a/b?token=1#frag")).toBe("https://x.test/a/b");
    expect(bareUrl("blob:http://x.test/uuid")).toBe("blob:…");
    expect(bareUrl("eval")).toBe("eval");
  });

  it("keeps a violation's text to one short line", () => {
    const [line] = formatCspReports(JSON.stringify({ "csp-report": { "effective-directive": "x".repeat(500) + "\nINJECTED", "blocked-uri": "inline" } }));
    expect(line).not.toContain("\n");
    expect(line!.length).toBeLessThan(250);
  });
});

describe("POST /api/csp-report", () => {
  it("logs readable reports and answers 204 whatever it receives", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const post = (body: string) => report(new Request("http://localhost/api/csp-report", { method: "POST", body }));
    const ok = await post(JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "https://x.test/i.png", "document-uri": "http://localhost/" } }));
    expect(ok.status).toBe(204);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("img-src would block https://x.test/i.png"));
    expect((await post("garbage")).status).toBe(204);
    expect((await post("x".repeat(100_000))).status).toBe(204);
    warn.mockRestore();
  });
});
