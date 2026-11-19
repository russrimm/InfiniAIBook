import { describe, expect, it } from "vitest";
import {
  BOOKEND_PROMPT_INSTRUCTION,
  DEFAULT_BOOKENDS,
  bookendEstimate,
  bookendKey,
  bookendProblems,
  bookendRequest,
  bookendStatus,
  bookendsOn,
  effectiveFade,
  normalizeBookendSetting,
  normalizeBookends,
  parseBookendPrompt,
  planBookends,
  shiftCaptions,
  type Bookends,
} from "@/lib/bookends";
import type { ClipCapabilities } from "@/lib/videoclip";

const caps: ClipCapabilities = {
  kind: "gemini",
  label: "Test video",
  model: "vid-1",
  aspects: ["16:9", "9:16"],
  durations: [3, 6, 9, 15],
  resolutions: [
    { id: "360p", label: "360p" },
    { id: "720p", label: "720p" },
  ],
  defaultResolution: "720p",
  maxVariants: 1,
  maxClips: 3,
  referenceImage: false,
  prices: { "360p": 0.05, "720p": 0.1 },
  priceNote: "test",
};

describe("settings", () => {
  it("are off by default, and unknown or hostile input falls back to that", () => {
    expect(normalizeBookends(undefined)).toEqual(DEFAULT_BOOKENDS);
    expect(normalizeBookends("x")).toEqual(DEFAULT_BOOKENDS);
    expect(bookendsOn(normalizeBookends({}))).toBe(false);
    expect(normalizeBookendSetting({ mode: "rm -rf" }).mode).toBe("off");
    expect(normalizeBookends({ fade: "forever" }).fade).toBe("short");
  });

  it("keeps clean values and drops malformed ones", () => {
    const s = normalizeBookendSetting({
      mode: "ai",
      prompt: "  A   calm\nharbor ",
      seconds: 5.5,
      resolution: "720p; drop",
      clipId: "../../etc",
      clipSeconds: 4,
      mute: "yes",
    });
    expect(s).toEqual({ mode: "ai", prompt: "A calm harbor" });
    const ok = normalizeBookendSetting({ mode: "upload", clipId: "abc_123-XY", clipSeconds: 4.256, label: "intro.mp4", mute: true, seconds: 6, resolution: "360p" });
    expect(ok).toMatchObject({ mode: "upload", clipId: "abc_123-XY", clipSeconds: 4.26, label: "intro.mp4", mute: true, seconds: 6, resolution: "360p" });
  });

  it("does not carry clip details without a clip id", () => {
    expect(normalizeBookendSetting({ mode: "library", clipSeconds: 4, label: "x" })).toEqual({ mode: "library" });
  });
});

describe("what a generated clip is asked for", () => {
  it("uses the nearest length the model offers, the shorter on a tie", () => {
    expect(bookendRequest({ mode: "ai", seconds: 5 }, caps).duration).toBe(6);
    expect(bookendRequest({ mode: "ai", seconds: 4 }, caps).duration).toBe(3);
    expect(bookendRequest({ mode: "ai" }, caps).duration).toBe(6);
    expect(bookendRequest({ mode: "ai", seconds: 60 }, caps).duration).toBe(15);
  });

  it("is landscape like the video, at a supported quality", () => {
    expect(bookendRequest({ mode: "ai", resolution: "360p" }, caps)).toMatchObject({ aspect: "16:9", resolution: "360p" });
    expect(bookendRequest({ mode: "ai", resolution: "4k" }, caps).resolution).toBe("720p");
    expect(bookendRequest({ mode: "ai" }, { ...caps, aspects: ["9:16"] }).aspect).toBe("9:16");
  });
});

describe("the cache key", () => {
  const req = { aspect: "16:9", duration: 6, resolution: "720p" };
  const base = { mode: "ai" as const, prompt: "A calm harbor." };

  it("is the same for the same prompt and options, so a re-render reuses the clip", () => {
    expect(bookendKey("intro", base, "m", req)).toBe(bookendKey("intro", { ...base }, "m", { ...req }));
  });

  it("changes with anything the clip depends on", () => {
    const k = bookendKey("intro", base, "m", req);
    expect(bookendKey("outro", base, "m", req)).not.toBe(k);
    expect(bookendKey("intro", { ...base, prompt: "A quiet field." }, "m", req)).not.toBe(k);
    expect(bookendKey("intro", base, "other", req)).not.toBe(k);
    expect(bookendKey("intro", base, "m", { ...req, duration: 3 })).not.toBe(k);
    expect(bookendKey("intro", base, "m", { ...req, resolution: "360p" })).not.toBe(k);
  });

  it("marks a clip ready, or stale once its prompt changed, but never an uploaded one", () => {
    const current = { model: "m", req };
    const made = { ...base, clipId: "clip1", clipKey: bookendKey("intro", base, "m", req) };
    expect(bookendStatus("intro", made, current)).toBe("ready");
    expect(bookendStatus("intro", { ...made, prompt: "Something else." }, current)).toBe("stale");
    expect(bookendStatus("intro", { mode: "upload", clipId: "c", clipKey: "old" }, current)).toBe("ready");
    expect(bookendStatus("intro", { mode: "ai", prompt: "x" }, current)).toBe("missing");
    expect(bookendStatus("intro", { mode: "off" }, current)).toBe("off");
  });
});

describe("what blocks a render", () => {
  const on = (over: Partial<Bookends>): Bookends => ({ ...DEFAULT_BOOKENDS, ...over });

  it("is nothing when both are off, even if a clip is left over", () => {
    expect(bookendProblems(DEFAULT_BOOKENDS, () => false)).toEqual([]);
    expect(bookendProblems(on({ intro: { mode: "off", clipId: "gone" } }), () => false)).toEqual([]);
  });

  it("names a requested slot with no clip, so a render never silently drops it", () => {
    const problems = bookendProblems(on({ intro: { mode: "ai", prompt: "x" }, outro: { mode: "upload" } }), () => true);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/intro clip is turned on but has no clip/);
    expect(problems[1]).toMatch(/outro clip is turned on but has no clip/);
  });

  it("names a clip whose file has gone, and passes one that is there", () => {
    const b = on({ intro: { mode: "library", clipId: "a1" }, outro: { mode: "library", clipId: "b2" } });
    expect(bookendProblems(b, (id) => id === "a1")).toEqual([expect.stringMatching(/outro clip file is missing/)]);
    expect(bookendProblems(b, () => true)).toEqual([]);
  });
});

describe("the combined cost", () => {
  const ai = (prompt: string, over = {}) => ({ mode: "ai" as const, prompt, ...over });

  it("adds up the clips still to be made at the model's rates", () => {
    const e = bookendEstimate(caps, { ...DEFAULT_BOOKENDS, intro: ai("a", { seconds: 6, resolution: "720p" }), outro: ai("b", { seconds: 3, resolution: "360p" }) });
    expect(e.items.map((i) => i.slot)).toEqual(["intro", "outro"]);
    expect(e.totalUsd).toBeCloseTo(6 * 0.1 + 3 * 0.05);
    expect(e.totalCents).toBe(75);
  });

  it("charges nothing for a clip that is ready, a slot that is off, or a library or uploaded clip", () => {
    const req = bookendRequest({ mode: "ai" }, caps);
    const ready = { ...ai("a"), clipId: "c1", clipKey: bookendKey("intro", ai("a"), caps.model, req) };
    const e = bookendEstimate(caps, { ...DEFAULT_BOOKENDS, intro: ready, outro: { mode: "upload", clipId: "c2" } });
    expect(e.items).toEqual([]);
    expect(e.totalUsd).toBe(0);
  });

  it("charges again for a stale clip, since regenerating is billed", () => {
    const req = bookendRequest({ mode: "ai" }, caps);
    const stale = { ...ai("changed"), clipId: "c1", clipKey: bookendKey("intro", ai("original"), caps.model, req) };
    expect(bookendEstimate(caps, { ...DEFAULT_BOOKENDS, intro: stale }).items).toHaveLength(1);
  });

  it("does not price a slot with no prompt yet", () => {
    expect(bookendEstimate(caps, { ...DEFAULT_BOOKENDS, intro: { mode: "ai" } }).items).toEqual([]);
  });
});

describe("the final timeline", () => {
  it("puts the intro first and shifts the video by the intro less the fade", () => {
    const p = planBookends(60, 5, 4, "short");
    expect(p).toMatchObject({ fade: 0.5, introStart: 0, introEnd: 5, mainStart: 4.5, mainEnd: 64.5, outroStart: 64, outroEnd: 68, total: 68, offset: 4.5 });
  });

  it("is the sum of the pieces less one fade per join", () => {
    expect(planBookends(60, 5, 4, "long").total).toBeCloseTo(60 + 5 + 4 - 2);
    expect(planBookends(60, 5, 4, "cut").total).toBe(69);
    expect(planBookends(60, 5, null, "short").total).toBeCloseTo(64.5);
    expect(planBookends(60, null, 4, "short")).toMatchObject({ offset: 0, total: 63.5 });
    expect(planBookends(60, null, null, "short")).toMatchObject({ offset: 0, total: 60 });
  });

  it("never lets a fade eat more than half of the shortest piece", () => {
    expect(effectiveFade("long", 60, 1.5, 4)).toBe(0.7);
    expect(effectiveFade("long", 60, 0.1)).toBe(0);
    expect(effectiveFade("cut", 60, 5)).toBe(0);
  });

  it("moves captions by the offset and leaves the originals alone", () => {
    const caps = [{ start: 1, end: 2.5, text: "Hello" }];
    expect(shiftCaptions(caps, 4.5)).toEqual([{ start: 5.5, end: 7, text: "Hello" }]);
    expect(caps[0].start).toBe(1);
    expect(shiftCaptions(caps, 0)).toEqual(caps);
  });
});

describe("drafting a prompt", () => {
  const ctx = { title: "Safer Harbors", seconds: 5, excerpt: "Boats use the harbor." };

  it("asks for an opening feel for an intro and a closing one for an outro, with no on-screen text", () => {
    const intro = BOOKEND_PROMPT_INSTRUCTION({ ...ctx, slot: "intro" });
    const outro = BOOKEND_PROMPT_INSTRUCTION({ ...ctx, slot: "outro" });
    expect(intro).toMatch(/5-second intro \(opening\) clip/);
    expect(intro).toMatch(/title-sequence/);
    expect(outro).toMatch(/closing/);
    expect(outro).toMatch(/thank you/);
    for (const text of [intro, outro]) {
      expect(text).toMatch(/No text, titles, captions/);
      expect(text).toMatch(/Safer Harbors/);
    }
  });

  it("reads the prompt from the reply and cleans it", () => {
    expect(parseBookendPrompt({ prompt: "**A calm** harbor at dusk [1]." })).toBe("A calm harbor at dusk .");
    expect(parseBookendPrompt("plain")).toBe("plain");
    expect(parseBookendPrompt({ prompt: 4 })).toBe("");
    expect(parseBookendPrompt(null)).toBe("");
  });
});
