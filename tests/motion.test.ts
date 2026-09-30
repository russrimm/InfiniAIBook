import { describe, expect, it } from "vitest";
import {
  DEFAULT_HERO,
  DEFAULT_MOTION_OPTIONS,
  DEFAULT_PALETTE,
  MAX_ACTORS_PER_SCENE,
  MAX_CHARACTER_CHARS,
  MAX_CLOSING_CHARS,
  MAX_PROPS,
  MAX_SCENES,
  MOTION_AUDIENCES,
  MOTION_PALETTES,
  MOTION_PLAN_INSTRUCTION,
  MOTION_RESOLUTIONS,
  MOTION_TONES,
  MOTION_VISUALS,
  applyMovement,
  backgroundPrompt,
  describeMotionOptions,
  heroPrompt,
  normalizeMotionOptions,
  normalizeMotionPlan,
  propPrompt,
  styleBase,
  type MotionPlan,
} from "@/lib/motion";
import {
  LEAD_IN,
  MIN_SCENE,
  TAIL,
  TRANSITION_S,
  compileTimeline,
  mp3Duration,
  type ActorLayer,
  type ChipsLayer,
  type SceneAssets,
  type StatLayer,
} from "@/lib/motiontimeline";

const scene = (over: Record<string, unknown> = {}) => ({
  beat: "how",
  headline: "HOW IT WORKS",
  subline: "Scraps go in, clean water comes out.",
  callouts: ["Fast", "Quiet"],
  background: "a bright kitchen",
  actors: [
    { kind: "hero", placement: "left", entrance: "slide-left", idle: "float" },
    { kind: "prop", description: "a steel bin", placement: "right", entrance: "pop", idle: "bob" },
  ],
  narration: "Here's how it works. Scraps go in and water comes out.",
  transition: "wipe",
  ...over,
});

const raw = (scenes: unknown[], extra: Record<string, unknown> = {}) => ({
  title: "Food waste, fixed",
  description: "How a digester turns scraps into water.",
  style: { palette: { dark: "#112233", primary: "not a color" }, hero: "a chef in a green apron" },
  scenes,
  ...extra,
});

describe("normalizeMotionPlan", () => {
  it("keeps a well-formed plan", () => {
    const plan = normalizeMotionPlan(raw([scene({ beat: "problem" }), scene(), scene({ beat: "cta" })]))!;
    expect(plan.scenes).toHaveLength(3);
    expect(plan.scenes[0].beat).toBe("problem");
    expect(plan.style.hero).toBe("a chef in a green apron");
  });

  it("returns null when fewer than three scenes survive", () => {
    expect(normalizeMotionPlan(raw([scene(), scene({ headline: "" })]))).toBeNull();
    expect(normalizeMotionPlan({})).toBeNull();
  });

  it("falls back per palette entry and uppercases valid hex", () => {
    const plan = normalizeMotionPlan(raw([scene(), scene(), scene()]))!;
    expect(plan.style.palette.dark).toBe("#112233");
    expect(plan.style.palette.primary).toBe(DEFAULT_PALETTE.primary);
    expect(plan.style.palette.light).toBe(DEFAULT_PALETTE.light);
  });

  it("uses the default hero when none is described", () => {
    const plan = normalizeMotionPlan(raw([scene(), scene(), scene()], { style: {} }))!;
    expect(plan.style.hero).toBe(DEFAULT_HERO);
  });

  it("whitelists enums", () => {
    const plan = normalizeMotionPlan(
      raw([
        scene({
          beat: "villain",
          transition: "explode",
          actors: [{ kind: "prop", description: "a box", placement: "up", entrance: "spin", idle: "dance" }],
        }),
        scene(),
        scene(),
      ])
    )!;
    const s = plan.scenes[0];
    expect(s.beat).toBe("how");
    expect(s.transition).toBe("wipe");
    expect(s.actors[0]).toMatchObject({ placement: "left", entrance: "pop", idle: "float" });
  });

  it("clamps text and strips citation markers and markup", () => {
    const plan = normalizeMotionPlan(
      raw([
        scene({
          headline: "A VERY LONG HEADLINE THAT GOES ON AND ON FOREVER",
          narration: "It **works** [1][2] well .",
          callouts: ["one", "two", "three", "four", "a chip that is far too long to fit"],
        }),
        scene(),
        scene(),
      ])
    )!;
    const s = plan.scenes[0];
    expect(s.headline.length).toBeLessThanOrEqual(36);
    expect(s.headline.endsWith(" ")).toBe(false);
    expect(s.narration).toBe("It works well.");
    expect(s.callouts).toEqual(["one", "two", "three"]);
  });

  it("caps actors per scene, allows one hero, and spreads placements", () => {
    const plan = normalizeMotionPlan(
      raw([
        scene({
          actors: [
            { kind: "hero", placement: "center" },
            { kind: "hero", placement: "center" },
            { kind: "prop", description: "a lamp", placement: "center" },
            { kind: "prop", description: "a chair", placement: "left" },
          ],
        }),
        scene(),
        scene(),
      ])
    )!;
    const actors = plan.scenes[0].actors;
    expect(actors).toHaveLength(MAX_ACTORS_PER_SCENE);
    expect(actors.filter((a) => a.kind === "hero")).toHaveLength(1);
    expect(new Set(actors.map((a) => a.placement)).size).toBe(actors.length);
  });

  it("caps props across the video and scenes overall", () => {
    const plan = normalizeMotionPlan(raw(Array.from({ length: 12 }, () => scene())))!;
    expect(plan.scenes).toHaveLength(MAX_SCENES);
    const props = plan.scenes.flatMap((s) => s.actors).filter((a) => a.kind === "prop");
    expect(props).toHaveLength(MAX_PROPS);
  });

  it("drops a stat without a number", () => {
    const plan = normalizeMotionPlan(
      raw([
        scene({ stat: { value: "Lots", label: "of food" } }),
        scene({ stat: { value: "40%", label: "less waste" } }),
        scene(),
      ])
    )!;
    expect(plan.scenes[0].stat).toBeUndefined();
    expect(plan.scenes[1].stat).toEqual({ value: "40%", label: "less waste" });
  });
});

describe("asset prompts", () => {
  it("never ask the image model for lettering", () => {
    const plan = normalizeMotionPlan(raw([scene(), scene(), scene()]))!;
    expect(backgroundPrompt(plan.scenes[0], plan.style)).toMatch(/No text/);
    expect(propPrompt(plan.scenes[0].actors[1], plan.style)).toMatch(/transparent/);
  });

  it("draws every asset in the chosen look", () => {
    const opts = normalizeMotionOptions({ visual: "papercut" });
    const plan = normalizeMotionPlan(raw([scene(), scene(), scene()]), opts)!;
    expect(styleBase(plan.style)).toContain(MOTION_VISUALS.papercut.look);
    expect(heroPrompt(plan.style)).toMatch(/paper-cutout/);
    expect(backgroundPrompt(plan.scenes[0], plan.style)).toMatch(/No text/);
  });
});

describe("normalizeMotionOptions", () => {
  it("defaults everything when nothing is given", () => {
    expect(normalizeMotionOptions(undefined)).toEqual(DEFAULT_MOTION_OPTIONS);
    expect(normalizeMotionOptions({ length: "epic", tone: 3, visual: "oil" })).toEqual(
      DEFAULT_MOTION_OPTIONS
    );
  });

  it("accepts presets, a custom palette and a palette object", () => {
    expect(normalizeMotionOptions({ palette: "forest" }).palette).toBe("forest");
    const custom = normalizeMotionOptions({
      palette: "custom",
      customPalette: { dark: "#000000", primary: "#ff0000", accent: "nope" },
    });
    expect(custom.palette).toBe("custom");
    expect(custom.customPalette).toMatchObject({ dark: "#000000", primary: "#FF0000" });
    expect(custom.customPalette!.accent).toBe(DEFAULT_PALETTE.accent);
    expect(normalizeMotionOptions({ palette: { dark: "#101010" } }).palette).toBe("custom");
  });

  it("reads the character as auto, none, custom or a bare description", () => {
    expect(normalizeMotionOptions({ character: "none" }).character).toBe("none");
    expect(normalizeMotionOptions({ character: "custom" }).character).toBe("auto");
    const described = normalizeMotionOptions({ character: "a robot **with** a lamp [1]" });
    expect(described).toMatchObject({ character: "custom", characterDescription: "a robot with a lamp" });
    expect(
      normalizeMotionOptions({ character: "custom", characterDescription: "x".repeat(400) })
        .characterDescription!.length
    ).toBeLessThanOrEqual(MAX_CHARACTER_CHARS);
  });

  it("clips the closing message and drops an empty one", () => {
    expect(normalizeMotionOptions({ closing: "   " }).closing).toBeUndefined();
    expect(normalizeMotionOptions({ closing: "y ".repeat(200) }).closing!.length).toBeLessThanOrEqual(
      MAX_CLOSING_CHARS
    );
  });

  it("lists only what differs from the defaults", () => {
    expect(describeMotionOptions(DEFAULT_MOTION_OPTIONS)).toEqual([]);
    expect(
      describeMotionOptions(normalizeMotionOptions({ length: "short", palette: "berry", resolution: "1080p" }))
    ).toEqual(["Short", "Berry colors", "1080p"]);
    expect(describeMotionOptions(normalizeMotionOptions({ movement: "still" }))).toEqual([
      "still motion",
    ]);
  });

  it("reads the character movement, defaulting to a gentle float", () => {
    expect(normalizeMotionOptions({}).movement).toBe("gentle");
    expect(normalizeMotionOptions({ movement: "lively" }).movement).toBe("lively");
    expect(normalizeMotionOptions({ movement: "wiggle" }).movement).toBe("gentle");
  });
});

describe("applyMovement", () => {
  const plan = () => normalizeMotionPlan(raw([scene(), scene(), scene({ beat: "cta" })]))!;
  const idles = (p: MotionPlan) => p.scenes.flatMap((s) => s.actors.map((a) => a.idle));

  it("keeps the planner's floats and bobs when lively", () => {
    expect(idles(applyMovement(plan(), "lively"))).toContain("bob");
  });

  it("turns bobs into floats when gentle, and stops everything when still", () => {
    expect(idles(applyMovement(plan(), "gentle"))).not.toContain("bob");
    expect(idles(applyMovement(plan(), "gentle"))).toContain("float");
    expect(new Set(idles(applyMovement(plan(), "still")))).toEqual(new Set(["none"]));
  });

  it("does not change the stored plan", () => {
    const p = plan();
    applyMovement(p, "still");
    expect(idles(p)).toContain("bob");
  });
});

describe("customized plans", () => {
  const three = () => raw([scene(), scene(), scene({ beat: "cta" })]);

  it("pins a chosen palette over the model's", () => {
    const plan = normalizeMotionPlan(three(), normalizeMotionOptions({ palette: "sunset" }))!;
    expect(plan.style.palette).toEqual(MOTION_PALETTES.sunset.colors);
  });

  it("uses a described character instead of the model's", () => {
    const plan = normalizeMotionPlan(
      three(),
      normalizeMotionOptions({ character: "custom", characterDescription: "a nurse in blue scrubs" })
    )!;
    expect(plan.style.hero).toBe("a nurse in blue scrubs");
  });

  it("drops every hero actor when there is no character", () => {
    const plan = normalizeMotionPlan(three(), normalizeMotionOptions({ character: "none" }))!;
    expect(plan.style.hero).toBe("");
    expect(plan.scenes.flatMap((s) => s.actors).every((a) => a.kind === "prop")).toBe(true);
  });

  it("asks the planner for the chosen length, tone, audience and closing", () => {
    const opts = normalizeMotionOptions({
      length: "short",
      tone: "professional",
      audience: "executives",
      character: "none",
      closing: "Book a demo at example.com",
    });
    const prompt = MOTION_PLAN_INSTRUCTION("", opts);
    expect(prompt).toContain("Plan a 5-scene video");
    expect(prompt).toContain("3. how — the single most important");
    expect(prompt).toContain(MOTION_TONES.professional.rule);
    expect(prompt).toContain(MOTION_AUDIENCES.executives.rule);
    expect(prompt).toContain('"Book a demo at example.com"');
    expect(prompt).toContain("There is no recurring character");
    expect(MOTION_PLAN_INSTRUCTION("")).toContain("Plan a 7-scene video");
    expect(MOTION_PLAN_INSTRUCTION("", normalizeMotionOptions({ length: "long" }))).toContain(
      "3-7. how"
    );
  });

  it("scales the timeline to the chosen resolution", () => {
    const plan = normalizeMotionPlan(three())!;
    const assets: SceneAssets[] = plan.scenes.map(() => ({
      background: "bg.png",
      actors: ["a.png", "b.png"],
      narration: "n.mp3",
      narrationSeconds: 5,
    }));
    const { width, height } = MOTION_RESOLUTIONS["1080p"];
    const hd = compileTimeline(plan, assets, { output: "o.mp4", width, height });
    const sd = compileTimeline(plan, assets, { output: "o.mp4" });
    expect([hd.width, hd.height]).toEqual([1920, 1080]);
    const size = (c: typeof hd) => c.scenes[0].layers.find((l) => l.type === "headline")!;
    expect((size(hd) as { size: number }).size).toBe(Math.round((size(sd) as { size: number }).size * 1.5));
    expect(hd.duration).toBe(sd.duration);
  });
});

function fixture(): { plan: MotionPlan; assets: SceneAssets[] } {
  const plan = normalizeMotionPlan(
    raw([
      scene({ beat: "problem", stat: { value: "1.3B tons", label: "wasted a year" }, transition: "fade" }),
      scene({ transition: "slide", callouts: ["Solo"] }),
      scene({ beat: "cta", callouts: [] }),
    ])
  )!;
  const assets: SceneAssets[] = [
    { background: "bg1.png", actors: ["hero.png", "bin.png"], narration: "n1.mp3", narrationSeconds: 6.2 },
    { background: null, actors: [null, "bin.png"], narration: "n2.mp3", narrationSeconds: 1.1 },
    { background: "unused.png", actors: ["hero.png", "bin.png"], narration: null, narrationSeconds: null },
  ];
  return { plan, assets };
}

describe("compileTimeline", () => {
  it("lays scenes end to end and sums to the total", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    let clock = 0;
    for (const s of cfg.scenes) {
      expect(s.start).toBeCloseTo(clock, 3);
      expect(s.duration).toBeGreaterThanOrEqual(MIN_SCENE);
      clock += s.duration;
    }
    expect(cfg.duration).toBeCloseTo(clock, 3);
    expect(cfg.scenes[0].duration).toBeCloseTo(LEAD_IN + 6.2 + TAIL, 3);
    // A short clip still gets the minimum scene length.
    expect(cfg.scenes[1].duration).toBe(MIN_SCENE);
  });

  it("starts narration after the transition and inside its scene", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    expect(cfg.narration).toHaveLength(2);
    cfg.narration.forEach((n, i) => {
      const s = cfg.scenes[i];
      expect(n.at).toBeGreaterThanOrEqual(s.start + s.transition.duration);
      expect(n.at).toBeLessThan(s.start + s.duration);
    });
    expect(TRANSITION_S).toBeLessThanOrEqual(LEAD_IN);
  });

  it("opens with a fade and keeps each scene's own transition after that", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    expect(cfg.scenes[0].transition.kind).toBe("fade");
    expect(cfg.scenes[1].transition.kind).toBe("slide");
  });

  it("drops actors whose picture failed and keeps keyframes in time order", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    const actors = (i: number) => cfg.scenes[i].layers.filter((l): l is ActorLayer => l.type === "actor");
    expect(actors(0)).toHaveLength(2);
    expect(actors(1)).toHaveLength(1);
    for (const s of cfg.scenes) {
      for (const layer of s.layers) {
        if (layer.type !== "actor") continue;
        const times = layer.keyframes.map((k) => k.t);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        expect(times.at(-1)!).toBeLessThan(s.duration);
        const last = layer.keyframes.at(-1)!;
        expect(last).toMatchObject({ dx: 0, dy: 0, scale: 1, opacity: 1 });
        expect(layer.cx).toBeGreaterThan(0);
        expect(layer.cx).toBeLessThan(cfg.width);
      }
    }
  });

  it("turns the hero to face inward on the right", () => {
    const { plan, assets } = fixture();
    plan.scenes[0].actors = [{ ...plan.scenes[0].actors[0], placement: "right" }];
    const cfg = compileTimeline(plan, [{ ...assets[0], actors: ["hero.png"] }, assets[1], assets[2]], {
      output: "out.mp4",
    });
    const hero = cfg.scenes[0].layers.find((l): l is ActorLayer => l.type === "actor")!;
    expect(hero.flip).toBe(true);
  });

  it("puts the stat in a slot no actor uses", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    const layers = cfg.scenes[0].layers;
    const stat = layers.find((l): l is StatLayer => l.type === "stat")!;
    const taken = layers.filter((l): l is ActorLayer => l.type === "actor").map((a) => a.cx);
    expect(taken).not.toContain(stat.cx);
  });

  it("times chips inside the narration", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    const chips = cfg.scenes[0].layers.find((l): l is ChipsLayer => l.type === "chips")!;
    for (const c of chips.items) {
      expect(c.at).toBeGreaterThanOrEqual(LEAD_IN);
      expect(c.at).toBeLessThan(LEAD_IN + 6.2);
    }
  });

  it("renders the closing card on a solid color and passes music through", () => {
    const { plan, assets } = fixture();
    const cfg = compileTimeline(plan, assets, { output: "out.mp4", music: "track.mp3" });
    expect(cfg.scenes[2].background.src).toBeNull();
    const backdrops = (i: number) =>
      cfg.scenes[i].layers.filter((l): l is ActorLayer => l.type === "actor").map((a) => a.backdrop);
    expect(backdrops(2).every(Boolean)).toBe(true);
    expect(backdrops(0).every((b) => b === null)).toBe(true);
    expect(cfg.scenes[0].background.src).toBe("bg1.png");
    expect(cfg.music).toEqual({ src: "track.mp3", volume: 0.35 });
    expect(compileTimeline(plan, assets, { output: "o.mp4" }).music).toBeNull();
  });

  it("estimates a scene from its words when the clip is missing", () => {
    const { plan, assets } = fixture();
    plan.scenes[2].narration = Array.from({ length: 52 }, () => "word").join(" ");
    const cfg = compileTimeline(plan, assets, { output: "out.mp4" });
    expect(cfg.scenes[2].duration).toBeCloseTo(LEAD_IN + 20 + TAIL, 3);
  });
});

describe("mp3Duration", () => {
  // MPEG-2 Layer III, 96 kbit/s, 24 kHz: the Speech output format.
  const frame = () => {
    const f = new Uint8Array(288);
    f.set([0xff, 0xf3, 0xa4, 0x00]);
    return f;
  };

  it("sums Layer III frames", () => {
    const buf = new Uint8Array(288 * 100);
    for (let i = 0; i < 100; i++) buf.set(frame(), i * 288);
    expect(mp3Duration(buf)).toBeCloseTo(2.4, 3);
  });

  it("skips an ID3v2 tag", () => {
    const tag = new Uint8Array(10 + 20);
    tag.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20]);
    const buf = new Uint8Array(tag.length + 288 * 50);
    buf.set(tag);
    for (let i = 0; i < 50; i++) buf.set(frame(), tag.length + i * 288);
    expect(mp3Duration(buf)).toBeCloseTo(1.2, 3);
  });

  it("falls back to the bitrate when nothing parses", () => {
    expect(mp3Duration(new Uint8Array(12_000))).toBeCloseTo(1, 3);
  });
});
