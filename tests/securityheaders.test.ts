import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const rules = async () => (await nextConfig.headers?.()) ?? [];
const valueOf = (headers: { key: string; value: string }[], key: string) => headers.find((h) => h.key === key)?.value;

describe("response security headers", () => {
  it("sends the baseline headers on every path", async () => {
    const all = (await rules()).find((r) => !r.has);
    expect(all?.source).toBe("/:path*");
    const h = all!.headers;
    expect(valueOf(h, "X-Frame-Options")).toBe("DENY");
    expect(valueOf(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(valueOf(h, "Referrer-Policy")).toBe("no-referrer");
    expect(valueOf(h, "X-Permitted-Cross-Domain-Policies")).toBe("none");
    expect(valueOf(h, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });

  it("turns off browser features the app never uses and keeps the two it asks for for itself", async () => {
    const policy = valueOf((await rules()).find((r) => !r.has)!.headers, "Permissions-Policy")!;
    for (const off of ["camera", "geolocation", "payment", "usb"]) expect(policy).toContain(`${off}=()`);
    // Live discussion needs the microphone and Screen helper needs screen capture.
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("display-capture=(self)");
  });

  it("sends HSTS only when the request arrived over HTTPS through a proxy", async () => {
    const withHsts = (await rules()).filter((r) => r.headers.some((h) => h.key === "Strict-Transport-Security"));
    expect(withHsts).toHaveLength(1);
    expect(withHsts[0].has).toEqual([{ type: "header", key: "x-forwarded-proto", value: "https" }]);
    const hsts = valueOf(withHsts[0].headers, "Strict-Transport-Security")!;
    expect(hsts).toMatch(/^max-age=\d{7,}$/);
    expect(hsts).not.toMatch(/includeSubDomains|preload/i);
    // The unconditional rule never carries it, so plain-HTTP localhost cannot be pinned to HTTPS.
    expect(valueOf((await rules()).find((r) => !r.has)!.headers, "Strict-Transport-Security")).toBeUndefined();
  });
});
