import { afterEach, describe, expect, it } from "vitest";
import {
  bearerAllowed,
  createSessionToken,
  requestIsHttps,
  verifySessionToken,
} from "@/lib/auth";

const DAY = 24 * 60 * 60 * 1000;

afterEach(() => {
  delete process.env.INFINIAIBOOK_SESSION_SECRET;
  delete process.env.INFINIAIBOOK_API_TOKEN;
  delete process.env.INFINIAIBOOK_ALLOW_PASSWORD_BEARER;
  delete process.env.TRUST_PROXY;
});

describe("session tokens", () => {
  it("round-trips and never contains the password", async () => {
    const t = await createSessionToken("hunter2");
    expect(t).toMatch(/^v2\.\d+\.\d+\.[0-9a-f]{64}$/);
    expect(t).not.toContain("hunter2");
    expect(await verifySessionToken(t, "hunter2")).toBe(true);
  });

  it("rejects a token for another password", async () => {
    const t = await createSessionToken("hunter2");
    expect(await verifySessionToken(t, "other")).toBe(false);
  });

  it("expires", async () => {
    const now = Date.now();
    const t = await createSessionToken("pw", now, 60);
    expect(await verifySessionToken(t, "pw", now + 30_000)).toBe(true);
    expect(await verifySessionToken(t, "pw", now + 61_000)).toBe(false);
  });

  it("rejects tampered expiry", async () => {
    const now = Date.now();
    const t = await createSessionToken("pw", now, 60);
    const [v, iat, , mac] = t.split(".");
    const forged = [v, iat, String(Math.floor(now / 1000) + 365 * 86400), mac].join(".");
    expect(await verifySessionToken(forged, "pw", now)).toBe(false);
  });

  it("is invalidated by rotating the session secret", async () => {
    process.env.INFINIAIBOOK_SESSION_SECRET = "a";
    const t = await createSessionToken("pw");
    process.env.INFINIAIBOOK_SESSION_SECRET = "b";
    expect(await verifySessionToken(t, "pw")).toBe(false);
  });

  it("rejects the old v1 cookie format and garbage", async () => {
    expect(await verifySessionToken("a".repeat(64), "pw")).toBe(false);
    expect(await verifySessionToken("", "pw")).toBe(false);
    expect(await verifySessionToken("v2.1.2.zz", "pw", 0 + DAY)).toBe(false);
  });
});

describe("bearerAllowed", () => {
  it("does not accept the password as a bearer token unless opted in", () => {
    expect(bearerAllowed("pw", "pw")).toBe(false);
    process.env.INFINIAIBOOK_ALLOW_PASSWORD_BEARER = "true";
    expect(bearerAllowed("pw", "pw")).toBe(true);
    expect(bearerAllowed("nope", "pw")).toBe(false);
  });

  it("only accepts the API token once one is set", () => {
    process.env.INFINIAIBOOK_API_TOKEN = "tok";
    expect(bearerAllowed("tok", "pw")).toBe(true);
    expect(bearerAllowed("pw", "pw")).toBe(false);
  });
});

describe("requestIsHttps", () => {
  it("trusts X-Forwarded-Proto only with TRUST_PROXY", () => {
    const req = new Request("http://localhost/", { headers: { "x-forwarded-proto": "https" } });
    expect(requestIsHttps(req)).toBe(false);
    process.env.TRUST_PROXY = "true";
    expect(requestIsHttps(req)).toBe(true);
    expect(requestIsHttps(new Request("https://x/"))).toBe(true);
  });
});
