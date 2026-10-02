import { afterEach, describe, expect, it, vi } from "vitest";
import { REDUCED_MOTION_QUERY, prefersReducedMotion, scrollBehavior } from "@/lib/reducedMotion";

/** A stand-in for `window` whose media query answers with `reduce`. */
function fakeWindow(reduce: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: reduce && query === REDUCED_MOTION_QUERY }) as MediaQueryList);
  return { matchMedia };
}

describe("reduced motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the standard media query", () => {
    const win = fakeWindow(true);
    prefersReducedMotion(win);
    expect(win.matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("follows the user's preference", () => {
    expect(prefersReducedMotion(fakeWindow(true))).toBe(true);
    expect(prefersReducedMotion(fakeWindow(false))).toBe(false);
  });

  it("scrolls instantly under reduced motion and smoothly otherwise", () => {
    expect(scrollBehavior(fakeWindow(true))).toBe("auto");
    expect(scrollBehavior(fakeWindow(false))).toBe("smooth");
  });

  it("reads the preference at call time, so a change applies immediately", () => {
    let reduce = false;
    const win = { matchMedia: () => ({ matches: reduce }) as MediaQueryList };
    expect(scrollBehavior(win)).toBe("smooth");
    reduce = true;
    expect(scrollBehavior(win)).toBe("auto");
  });

  it("defaults to the global window when one exists", () => {
    vi.stubGlobal("window", fakeWindow(true));
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("keeps normal motion where matchMedia is unavailable (server, old browsers)", () => {
    expect(typeof window).toBe("undefined");
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
    expect(prefersReducedMotion({} as Pick<Window, "matchMedia">)).toBe(false);
  });
});
