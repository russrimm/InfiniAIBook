import { afterEach, describe, expect, it } from "vitest";
import {
  decodeJs,
  glitchJs,
  hightechTheme,
  jsStr,
  luminance,
  neon,
  prng,
  seedOf,
  spreadJs,
  typeJs,
} from "@/lib/hightech";
import { DEFAULT_MOTION_OPTIONS, MOTION_PALETTES, MOTION_VISUALS, normalizeMotionOptions } from "@/lib/motion";
import { DEFAULT_COMPOSITION, normalizeComposition } from "@/lib/trainingvisuals";
import { chooseRenderer, hyperframesFailedNote, resetHyperframesProbe } from "@/lib/hyperframes";

describe("high-tech building blocks", () => {
  it("draws the same numbers from the same seed, and different ones from another", () => {
    const run = (seed: number) => {
      const r = prng(seed);
      return [r(), r(), r()];
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
    expect(run(7).every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seedOf("a", 1)).toBe(seedOf("a", 1));
    expect(seedOf("a", 1)).not.toBe(seedOf("a", 2));
  });

  it("writes strings that cannot end an inline script", () => {
    const s = jsStr('</script><!-- "x" & \u2028');
    expect(s).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(s)).toBe('</script><!-- "x" & \u2028');
  });

  it("decodes into the real text, keeping spaces and the length", () => {
    const lines = decodeJs("t", "Hello big world", 2, 0.5, 1);
    const shown = lines.map((l) => JSON.parse(/textContent:("(?:[^"\\]|\\.)*")/.exec(l)![1]) as string);
    expect(shown.at(-1)).toBe("Hello big world");
    for (const s of shown) {
      expect(s).toHaveLength("Hello big world".length);
      expect(s[5]).toBe(" ");
    }
    expect(decodeJs("t", "Hello big world", 2, 0.5, 1)).toEqual(lines);
  });

  it("types a line one character at a time and hides the cursor at the end", () => {
    const lines = typeJs({ on: "o", off: "f", cursor: "u" }, "abc", 1, 10, 1);
    expect(lines.join("\n")).toContain('tl.set("#o",{textContent:"abc"}');
    expect(lines.join("\n")).toContain('tl.set("#f",{textContent:""}');
    expect(lines.at(-1)).toContain('"#u",{opacity:0}');
  });

  it("settles a glitch back to rest, and spreads letters with transforms only", () => {
    const g = glitchJs('"#x"', 1, 0.4, 3, 1280, 1);
    expect(g.at(-1)).toContain('x:0,opacity:1,clipPath:"none",filter:"none"');
    expect(g).toEqual(glitchJs('"#x"', 1, 0.4, 3, 1280, 1));
    const spread: string[] = [];
    spreadJs(spread, "tag", "ABC", 0, 0.5, 5);
    expect(spread.join("")).not.toContain("letterSpacing");
    expect(spread).toHaveLength(3);
  });

  it("makes a dark base and glowing neons from any palette", () => {
    for (const colors of [MOTION_PALETTES.cyber.colors, MOTION_PALETTES.mono.colors, { dark: "#FFFFFF", primary: "#202020", accent: "#101010", pop: "#000000", light: "#FFFFFF" }]) {
      const t = hightechTheme(colors);
      expect(luminance(t.base)).toBeLessThan(0.05);
      for (const c of [t.a1, t.a2, t.a3]) expect(luminance(c)).toBeGreaterThanOrEqual(0.3);
    }
    expect(neon("not a color")).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("high-tech style requests", () => {
  it("adds the style as a look and a theme, and keeps the defaults", () => {
    expect(DEFAULT_MOTION_OPTIONS.visual).toBe("flat");
    expect(DEFAULT_COMPOSITION.look).toBe("standard");
    expect(DEFAULT_COMPOSITION.palette).toBe("slate");
    expect(MOTION_VISUALS.hightech.look).toMatch(/HUD/);
    expect(MOTION_PALETTES.cyber.label).toBe("High-tech");
  });

  it("accepts the motion look and rejects unknown ones", () => {
    expect(normalizeMotionOptions({ visual: "hightech" }).visual).toBe("hightech");
    expect(normalizeMotionOptions({ visualStyle: "hightech" }).visual).toBe("hightech");
    expect(normalizeMotionOptions({ visual: "neon-noir" }).visual).toBe("flat");
    expect(normalizeMotionOptions({ visual: { evil: 1 } }).visual).toBe("flat");
    expect(normalizeMotionOptions({}).visual).toBe("flat");
    expect(normalizeMotionOptions({ palette: "cyber" }).palette).toBe("cyber");
  });

  it("accepts the training look and rejects unknown ones", () => {
    expect(normalizeComposition({ look: "hightech" }).look).toBe("hightech");
    expect(normalizeComposition({ look: "hightech", palette: "cyber" }).palette).toBe("cyber");
    expect(normalizeComposition({ look: "<b>x</b>" }).look).toBe("standard");
    expect(normalizeComposition({}).look).toBe("standard");
    expect(normalizeComposition(undefined).look).toBe("standard");
  });
});

describe("choosing the renderer for the high-tech style", () => {
  const names = ["TRAINING_RENDERER", "MOTION_RENDERER", "HYPERFRAMES_BIN"] as const;
  const saved = Object.fromEntries(names.map((n) => [n, process.env[n]]));
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    resetHyperframesProbe();
  });

  it("leaves the standard styles on the configured renderer", () => {
    delete process.env.TRAINING_RENDERER;
    expect(chooseRenderer("TRAINING_RENDERER", false)).toEqual({ renderer: "python" });
    process.env.TRAINING_RENDERER = "hyperframes";
    expect(chooseRenderer("TRAINING_RENDERER", false)).toEqual({ renderer: "hyperframes" });
  });

  it("uses HyperFrames automatically when it can start", () => {
    delete process.env.MOTION_RENDERER;
    process.env.HYPERFRAMES_BIN = "hyperframes";
    expect(chooseRenderer("MOTION_RENDERER", true)).toEqual({ renderer: "hyperframes" });
    process.env.MOTION_RENDERER = "hyperframes";
    expect(chooseRenderer("MOTION_RENDERER", true)).toEqual({ renderer: "hyperframes" });
  });

  it("honors an explicit python setting, with a note", () => {
    process.env.TRAINING_RENDERER = "python";
    const c = chooseRenderer("TRAINING_RENDERER", true);
    expect(c.renderer).toBe("python");
    expect(c.note).toMatch(/high-tech effects need HyperFrames/);
  });

  it("says what was lost when HyperFrames fails", () => {
    expect(hyperframesFailedNote(false, "compositor")).toBe(
      "HyperFrames could not render this video, so the standard compositor was used.",
    );
    expect(hyperframesFailedNote(true, "renderer")).toBe(
      "HyperFrames could not render this video, so the standard renderer was used without the high-tech effects.",
    );
  });
});
