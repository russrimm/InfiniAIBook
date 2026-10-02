import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/access";

describe("safeNextPath", () => {
  const origin = "http://localhost:3000";

  it("keeps same-origin paths with query and hash", () => {
    expect(safeNextPath("/notebook/abc?x=1#y", origin)).toBe("/notebook/abc?x=1#y");
    expect(safeNextPath("/", origin)).toBe("/");
  });

  it("falls back to / for missing or off-site values", () => {
    for (const bad of [
      null,
      "",
      "notebook",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "https://evil.example/",
      "/%0a",
    ]) {
      const out = safeNextPath(bad, origin);
      expect(new URL(out, origin).origin).toBe(origin);
    }
    expect(safeNextPath("/\\evil.example", origin)).toBe("/");
    expect(safeNextPath("/\t/evil.example", origin)).toBe("/");
  });
});
