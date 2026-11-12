import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "@/middleware";
import { AUTH_COOKIE, createSessionToken } from "@/lib/auth";

const ENV_KEYS = [
  "INFINIAIBOOK_PASSWORD",
  "INFINIAIBOOK_API_TOKEN",
  "INFINIAIBOOK_ALLOW_PASSWORD_BEARER",
  "INFINIAIBOOK_SESSION_SECRET",
  "ALLOWED_HOSTS",
  "TRUST_PROXY",
];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const call = (path: string, headers: Record<string, string> = {}, method = "GET") =>
  middleware(new NextRequest(`http://localhost:3000${path}`, { method, headers: { host: "localhost:3000", ...headers } }));

const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

/** A rejected bearer sleeps for its back-off, so the clock is advanced past it. */
const callWithBackoff = async (...args: Parameters<typeof call>) => {
  vi.useFakeTimers();
  const pending = call(...args);
  await vi.advanceTimersByTimeAsync(60_000);
  const res = await pending;
  vi.useRealTimers();
  return res;
};

describe("middleware without a password", () => {
  it("serves loopback hosts", async () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) {
      expect(passes(await call("/", { host }))).toBe(true);
    }
  });

  it("refuses other hostnames with JSON for the API and text for pages", async () => {
    const api = await call("/api/notebooks", { host: "evil.example" });
    expect(api.status).toBe(403);
    expect(await api.json()).toMatchObject({ code: "host", error: expect.stringContaining("evil.example") });

    const page = await call("/", { host: "evil.example" });
    expect(page.status).toBe(403);
    expect(page.headers.get("content-type")).toContain("text/plain");
    expect(await page.text()).toContain("ALLOWED_HOSTS");
  });

  it("serves hostnames listed in ALLOWED_HOSTS and nothing else", async () => {
    process.env.ALLOWED_HOSTS = "notes.example.com";
    expect(passes(await call("/", { host: "notes.example.com" }))).toBe(true);
    expect((await call("/", { host: "other.example.com" })).status).toBe(403);
  });

  it("blocks browser writes from another site", async () => {
    const res = await call("/api/notebooks", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }, "POST");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Cross-site request blocked.", code: "csrf" });
  });

  it("allows same-origin writes, reads from anywhere, and clients that send no origin", async () => {
    expect(passes(await call("/api/notebooks", { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" }, "POST"))).toBe(true);
    expect(passes(await call("/api/notebooks", { "sec-fetch-site": "cross-site" }, "GET"))).toBe(true);
    expect(passes(await call("/api/notebooks", {}, "POST"))).toBe(true);
  });

  it("does not apply the cross-site check to pages", async () => {
    expect(passes(await call("/", { "sec-fetch-site": "cross-site" }, "POST"))).toBe(true);
  });
});

describe("middleware with a password", () => {
  const PASSWORD = "correct horse";
  const withPassword = () => {
    process.env.INFINIAIBOOK_PASSWORD = PASSWORD;
  };

  it("answers any host, since sign-in protects it", async () => {
    withPassword();
    const res = await call("/login", { host: "notes.example.com" });
    expect(passes(res)).toBe(true);
  });

  it("still enforces ALLOWED_HOSTS when it is set", async () => {
    withPassword();
    process.env.ALLOWED_HOSTS = "notes.example.com";
    expect((await call("/login", { host: "other.example.com" })).status).toBe(403);
  });

  it("answers API requests without a session with 401", async () => {
    withPassword();
    const res = await call("/api/notebooks");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required", code: "auth" });
  });

  it("redirects pages to the sign-in page, remembering where the visitor was going", async () => {
    withPassword();
    const deep = await call("/notebooks/abc?tab=studio");
    expect(deep.status).toBe(307);
    const location = new URL(deep.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/notebooks/abc?tab=studio");

    const home = await call("/");
    expect(new URL(home.headers.get("location")!).search).toBe("");
  });

  it("lets the sign-in page and auth endpoints through", async () => {
    withPassword();
    for (const path of ["/login", "/api/auth/login", "/api/auth/status"]) {
      expect(passes(await call(path))).toBe(true);
    }
  });

  it("accepts a valid session cookie", async () => {
    withPassword();
    const token = await createSessionToken(PASSWORD);
    expect(passes(await call("/api/notebooks", { cookie: `${AUTH_COOKIE}=${token}` }))).toBe(true);
  });

  it("rejects a forged, expired or other-password session cookie", async () => {
    withPassword();
    const expired = await createSessionToken(PASSWORD, Date.now() - 2 * 3600_000, 60);
    const other = await createSessionToken("other password");
    for (const value of ["v2.1.2.deadbeef", "garbage", expired, other]) {
      const res = await call("/api/notebooks", { cookie: `${AUTH_COOKIE}=${value}` });
      expect(res.status).toBe(401);
    }
  });

  it("invalidates cookies when the session secret changes", async () => {
    withPassword();
    const token = await createSessionToken(PASSWORD);
    process.env.INFINIAIBOOK_SESSION_SECRET = "rotated";
    expect((await call("/api/notebooks", { cookie: `${AUTH_COOKIE}=${token}` })).status).toBe(401);
  });

  it("accepts the API token as a bearer token", async () => {
    withPassword();
    process.env.INFINIAIBOOK_API_TOKEN = "script-token";
    expect(passes(await call("/api/notebooks", { authorization: "Bearer script-token" }))).toBe(true);
  });

  it("rejects the wrong bearer token, and the password itself unless that is switched on", async () => {
    withPassword();
    process.env.INFINIAIBOOK_API_TOKEN = "script-token";
    expect((await callWithBackoff("/api/notebooks", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await callWithBackoff("/api/notebooks", { authorization: `Bearer ${PASSWORD}` })).status).toBe(401);

    delete process.env.INFINIAIBOOK_API_TOKEN;
    expect((await callWithBackoff("/api/notebooks", { authorization: `Bearer ${PASSWORD}` })).status).toBe(401);

    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.INFINIAIBOOK_ALLOW_PASSWORD_BEARER = "true";
    expect(passes(await call("/api/notebooks", { authorization: `Bearer ${PASSWORD}` }))).toBe(true);
  });

  it("sends a failed bearer on a page request to the sign-in page", async () => {
    withPassword();
    const res = await callWithBackoff("/notebooks", { authorization: "Bearer wrong" });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("checks cross-site writes before authentication", async () => {
    withPassword();
    const res = await call("/api/notebooks", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }, "POST");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "csrf" });
  });
});
