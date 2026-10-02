import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * `prefers-reduced-motion: reduce` across the UI, in a real browser.
 *
 * The screen helper is the vehicle because it exercises all three kinds of
 * motion at once: its dialog enters with `.fade-up`, it shows a `.spinner`
 * while the model is thinking, and it scrolls its conversation from script.
 * The model reply is held back so the busy state can be inspected. Every
 * check also runs without the preference, to prove default motion is intact.
 */

declare global {
  interface Window {
    /** The `behavior` of every scripted element scroll, in call order. */
    __scrolls: string[];
  }
}

async function fakeScreenShare(page: Page) {
  await page.addInitScript(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d")!;
    const draw = () => {
      ctx.fillStyle = "#f4f6fa";
      ctx.fillRect(0, 0, 640, 360);
    };
    draw();
    // A canvas stream only emits frames when the canvas is painted.
    setInterval(draw, 100);
    Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
      configurable: true,
      value: async () => canvas.captureStream(10),
    });
  });
}

/** Record the `behavior` passed to scrollTo/scrollBy/scrollIntoView. */
async function recordScrolls(page: Page) {
  await page.addInitScript(() => {
    window.__scrolls = [];
    const proto = Element.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of ["scrollTo", "scrollBy", "scrollIntoView"]) {
      const original = proto[name];
      proto[name] = function (this: Element, ...args: unknown[]) {
        const opts = args[0];
        const behavior =
          typeof opts === "object" && opts !== null ? (opts as ScrollOptions).behavior : undefined;
        window.__scrolls.push(behavior ?? "auto");
        return original.apply(this, args);
      };
    }
  });
}

/** Computed animation facts for an element, including whether it moves. */
async function motionOf(locator: Locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const keyframes = el
      .getAnimations()
      .flatMap((a) => (a.effect instanceof KeyframeEffect ? a.effect.getKeyframes() : []));
    return {
      animationName: cs.animationName,
      transform: cs.transform,
      opacity: Number(cs.opacity),
      movesSpatially: keyframes.some((k) => "transform" in k || "translate" in k || "rotate" in k || "scale" in k),
    };
  });
}

/** Injected probes for transient classes (skeletons, typing dots). */
async function probeTransientClasses(page: Page) {
  return page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="shimmer" id="probe-shimmer" style="width:200px;height:40px"></div>' +
      '<span class="typing-dot" id="probe-dot"></span>';
    document.body.append(host);
    const shimmer = getComputedStyle(document.getElementById("probe-shimmer")!, "::after");
    const dot = getComputedStyle(document.getElementById("probe-dot")!);
    const result = {
      shimmerAnimation: shimmer.animationName,
      shimmerTransform: shimmer.transform,
      dotAnimation: dot.animationName,
    };
    host.remove();
    return result;
  });
}

const REPLY = {
  status: "next_step",
  say: "Sharing starts from the **Share** button.",
  step: "Click the blue Share button at the top right.",
  target: null,
};

/** Open the helper and leave it busy until the returned `release` is called. */
async function openBusyHelper(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/screen-help", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(REPLY) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /screen helper/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /screen helper/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("What do you need help with?").fill("Share this document");
  await dialog.getByRole("button", { name: "Share screen & ask" }).click();
  const spinner = dialog.locator(".spinner");
  await expect(spinner).toBeVisible();
  return { dialog, spinner, release };
}

test.beforeEach(async ({ page }) => {
  await fakeScreenShare(page);
  await recordScrolls(page);
});

test.describe("with prefers-reduced-motion: reduce", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("entrances fade without rising", async ({ page }) => {
    const { dialog, release } = await openBusyHelper(page);
    const fade = await motionOf(dialog);
    expect(fade.animationName).toBe("fadeIn");
    expect(fade.movesSpatially).toBe(false);
    release();
  });

  test("the busy spinner stays visible but does not rotate", async ({ page }) => {
    const { spinner, release } = await openBusyHelper(page);
    const first = await motionOf(spinner);
    await page.waitForTimeout(400);
    const later = await motionOf(spinner);

    expect(first.animationName).toBe("busyFade");
    expect(first.movesSpatially).toBe(false);
    expect(first.transform).toBe("none");
    expect(later.transform).toBe("none");
    expect(Math.min(first.opacity, later.opacity)).toBeGreaterThan(0.4);
    await expect(spinner).toBeVisible();
    release();
  });

  test("scripted scrolling jumps instead of gliding", async ({ page }) => {
    const { dialog, release } = await openBusyHelper(page);
    release();
    await expect(dialog.getByText("Click the blue Share button at the top right.")).toBeVisible();

    const scrolls = await page.evaluate(() => window.__scrolls);
    expect(scrolls.length).toBeGreaterThan(0);
    expect(scrolls).not.toContain("smooth");
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  });

  test("the shimmer and typing dots keep pulsing in place", async ({ page }) => {
    await page.goto("/");
    const probe = await probeTransientClasses(page);
    expect(probe.shimmerAnimation).toBe("shimmerFade");
    expect(probe.shimmerTransform).toBe("none");
    expect(probe.dotAnimation).toBe("typingDotFade");
  });
});

test.describe("without a motion preference", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });

  test("keeps the default motion unchanged", async ({ page }) => {
    const { dialog, spinner, release } = await openBusyHelper(page);

    const fade = await motionOf(dialog);
    expect(fade.animationName).toBe("fadeUp");
    expect(fade.movesSpatially).toBe(true);

    const spin = await motionOf(spinner);
    expect(spin.animationName).toBe("spin");
    expect(spin.movesSpatially).toBe(true);
    expect(spin.transform).not.toBe("none");

    const probe = await probeTransientClasses(page);
    expect(probe.shimmerAnimation).toBe("shimmer");
    expect(probe.dotAnimation).toBe("typingDot");

    release();
    await expect(dialog.getByText("Click the blue Share button at the top right.")).toBeVisible();
    expect(await page.evaluate(() => window.__scrolls)).toContain("smooth");
  });
});
