import { describe, expect, it } from "vitest";
import {
  THEME_EVENT,
  THEME_INIT_SCRIPT,
  THEME_KEY,
  nextPreference,
  parsePreference,
  resolveTheme,
} from "@/lib/theme";

describe("theme preference", () => {
  it("accepts only light or dark, otherwise follows the system", () => {
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("dark")).toBe("dark");
    expect(parsePreference("purple")).toBe("system");
    expect(parsePreference(null)).toBe("system");
  });

  it("resolves system from the OS and keeps explicit choices", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("cycles system, light, dark and back", () => {
    expect(nextPreference("system")).toBe("light");
    expect(nextPreference("light")).toBe("dark");
    expect(nextPreference("dark")).toBe("system");
  });

  it("ships a pre-paint script that reads the same storage key and event", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_EVENT));
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
  });
});