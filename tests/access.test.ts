import { describe, expect, it } from "vitest";
import { hostAllowed, hostnameOf, isCrossSiteWrite, parseAllowedHosts, refusesFrame } from "@/lib/access";

describe("hostnameOf", () => {
  it("strips ports and brackets", () => {
    expect(hostnameOf("localhost:3000")).toBe("localhost");
    expect(hostnameOf("[::1]:3000")).toBe("::1");
    expect(hostnameOf("::1")).toBe("::1");
    expect(hostnameOf("Notes.Example.com")).toBe("notes.example.com");
    expect(hostnameOf(null)).toBe("");
  });
});

describe("hostAllowed", () => {
  it("allows loopback names by default", () => {
    for (const h of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "app.localhost"]) {
      expect(hostAllowed(h, [])).toBe(true);
    }
  });

  it("refuses other hosts unless listed", () => {
    expect(hostAllowed("attacker.example:3000", [])).toBe(false);
    expect(hostAllowed("192.168.1.5:3000", [])).toBe(false);
    expect(hostAllowed(null, [])).toBe(false);
    const allowed = parseAllowedHosts("notes.example.com, 192.168.1.5:3000");
    expect(hostAllowed("notes.example.com", allowed)).toBe(true);
    expect(hostAllowed("192.168.1.5:3000", allowed)).toBe(true);
    expect(hostAllowed("anything", parseAllowedHosts("*"))).toBe(true);
  });
});

describe("refusesFrame", () => {
  it("refuses this app and loopback addresses", () => {
    expect(refusesFrame("https://notes.example/", "https://notes.example")).toMatch(/this app/);
    expect(refusesFrame("http://127.0.0.1:3000/api", "http://localhost:3000")).toMatch(/loopback/);
    expect(refusesFrame("https://example.com/paper", "https://notes.example")).toBeNull();
  });
});

describe("isCrossSiteWrite", () => {
  const base = { sameHosts: ["localhost:3000"], origin: null, secFetchSite: null };

  it("never blocks safe methods", () => {
    expect(isCrossSiteWrite({ ...base, method: "GET", secFetchSite: "cross-site" })).toBe(false);
  });

  it("blocks cross-site and same-site browser writes", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "cross-site" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, method: "DELETE", secFetchSite: "same-site" })).toBe(true);
  });

  it("allows same-origin and user-initiated requests", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "same-origin" })).toBe(false);
    expect(isCrossSiteWrite({ ...base, method: "POST", secFetchSite: "none" })).toBe(false);
  });

  it("falls back to Origin when Sec-Fetch-Site is missing", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: "http://localhost:3000" })).toBe(false);
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: "https://evil.example" })).toBe(true);
    expect(isCrossSiteWrite({ ...base, method: "POST", origin: "null" })).toBe(true);
  });

  it("allows non-browser clients that send neither header", () => {
    expect(isCrossSiteWrite({ ...base, method: "POST" })).toBe(false);
  });
});
