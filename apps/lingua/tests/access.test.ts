import { describe, expect, it } from "vitest";
import { basicAuthOk, hostAllowed, isCrossSiteWrite, parseAllowedHosts } from "@/lib/access";

describe("access", () => {
  it("serves loopback and listed hosts only", () => {
    const allowed = parseAllowedHosts(" Lingua.Example.com , ");
    expect(hostAllowed("localhost:3100", allowed)).toBe(true);
    expect(hostAllowed("[::1]:3100", allowed)).toBe(true);
    expect(hostAllowed("lingua.example.com", allowed)).toBe(true);
    expect(hostAllowed("evil.example", allowed)).toBe(false);
    expect(hostAllowed(null, allowed)).toBe(false);
    expect(hostAllowed("anything", ["*"])).toBe(true);
  });

  it("blocks cross-site writes but not reads or non-browser clients", () => {
    const base = { sameHosts: ["localhost:3100"] };
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "cross-site", origin: "https://x" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "same-origin", origin: null })).toBe(false);
    expect(isCrossSiteWrite({ ...base, method: "GET", secFetchSite: "cross-site", origin: null })).toBe(false);
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: null, origin: "http://localhost:3100" })).toBe(false);
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: null, origin: "http://evil:3100" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: null, origin: null })).toBe(false);
  });

  it("checks Basic auth with any username", () => {
    const header = (u: string, p: string) => `Basic ${btoa(`${u}:${p}`)}`;
    expect(basicAuthOk(header("me", "s3cret:x"), "s3cret:x")).toBe(true);
    expect(basicAuthOk(header("me", "wrong"), "s3cret")).toBe(false);
    expect(basicAuthOk("Bearer s3cret", "s3cret")).toBe(false);
    expect(basicAuthOk(null, "s3cret")).toBe(false);
  });
});
