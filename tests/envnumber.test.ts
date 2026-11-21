import { afterEach, describe, expect, it, vi } from "vitest";
import { envInt } from "@/lib/envnumber";

afterEach(() => vi.restoreAllMocks());

describe("envInt", () => {
  it("uses the default when the variable is unset or blank", () => {
    expect(envInt("X_UNSET", 7, 1, {})).toBe(7);
    expect(envInt("X_BLANK", 7, 1, { X_BLANK: "  " })).toBe(7);
  });

  it("reads a whole number, rounding down", () => {
    expect(envInt("X_OK", 7, 1, { X_OK: "1048576" })).toBe(1048576);
    expect(envInt("X_FRACTION", 7, 1, { X_FRACTION: "12.9" })).toBe(12);
  });

  it("never returns NaN, which would turn a limit off: a typo falls back and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of ["50MB", "abc", "-1", "0", "Infinity"]) {
      expect(envInt("X_TYPO", 25, 1, { X_TYPO: bad }), bad).toBe(25);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('X_TYPO="50MB"');
  });

  it("accepts zero where the minimum allows it", () => {
    expect(envInt("X_ZERO", 5, 0, { X_ZERO: "0" })).toBe(0);
  });
});
