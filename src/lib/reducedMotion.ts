/**
 * JS-side support for `prefers-reduced-motion`. CSS handles animations and
 * transitions in globals.css; this covers motion started from script, such as
 * `scrollIntoView` and `scrollTo`, where a stylesheet can't intervene.
 *
 * The preference is read at call time rather than cached in React state, so a
 * change in OS settings applies to the very next scroll without a re-render.
 */

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MediaWindow = Pick<Window, "matchMedia">;

function currentWindow(): MediaWindow | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** True when the user asked the OS or browser to minimize motion. */
export function prefersReducedMotion(win: MediaWindow | undefined = currentWindow()): boolean {
  return typeof win?.matchMedia === "function" && win.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** `"smooth"` normally; `"auto"` (an instant jump) under reduced motion. */
export function scrollBehavior(win: MediaWindow | undefined = currentWindow()): ScrollBehavior {
  return prefersReducedMotion(win) ? "auto" : "smooth";
}
