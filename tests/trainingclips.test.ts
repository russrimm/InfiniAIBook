import { describe, expect, it } from "vitest";
import {
  ANIMATION_PRESETS,
  DEFAULT_COMPOSITION,
  TRAINING_VISUALS_INSTRUCTION,
  cueHasClip,
  normalizeAnimation,
  normalizeCue,
  normalizeCues,
  normalizeVisualPlan,
} from "@/lib/trainingvisuals";
import {
  compileTrainingTimeline,
  estimateSectionTiming,
  rasterJobs,
  renderConfig,
  type ComposeInput,
} from "@/lib/trainingtimeline";
import { buildHyperframesProject } from "@/lib/traininghyperframes";

const S1 = "Welcome to the check. Here is what you will learn today. First the stage, then the panels.";

const clipCue = {
  kind: "clip",
  anchor: "First the stage",
  layout: "side-right",
  transition: "fade",
  clipId: "abc123def456",
  clipSeconds: 4,
  clipPrompt: "A slow dolly shot along raised garden beds at dawn.",
  caption: "Beds at dawn",
};

const input = (cues: unknown[] = [clipCue]): ComposeInput => ({
  title: "Clip check",
  objectives: [],
  composition: {
    ...DEFAULT_COMPOSITION,
    animation: normalizeAnimation(ANIMATION_PRESETS.full),
    intro: false,
    outro: false,
    sectionCards: false,
    lowerThird: { enabled: false, name: "", role: "" },
  },
  sections: [{ title: "Welcome", text: S1, cues: normalizeCues(cues) }],
});
const timings = [{ ...estimateSectionTiming(S1), duration: 8, source: "avatar" as const }];

describe("a clip visual in the cue model", () => {
  it("keeps its clip, prompt, length and caption, and only a loop fit", () => {
    const cue = normalizeCue({ ...clipCue, clipFit: "loop" })!;
    expect(cue).toMatchObject({ kind: "clip", clipId: "abc123def456", clipSeconds: 4, clipFit: "loop", caption: "Beds at dawn" });
    expect(cue.clipPrompt).toMatch(/dolly shot/);
    expect(normalizeCue({ ...clipCue, clipFit: "hold" })!.clipFit).toBeUndefined();
    expect(cueHasClip(cue)).toBe(true);
    expect(cueHasClip({ kind: "image", clipId: "abc123def456" })).toBe(false);
  });

  it("drops a clip visual with neither a clip nor a prompt, but keeps one the person is still filling in", () => {
    expect(normalizeCue({ kind: "clip", anchor: "x" })).toBeNull();
    expect(normalizeCue({ kind: "clip", anchor: "x" }, undefined, true)).toMatchObject({ kind: "clip" });
    expect(normalizeCue({ kind: "clip", anchor: "x", clipPrompt: "A calm harbor at dusk." })).toMatchObject({ clipPrompt: "A calm harbor at dusk." });
  });

  it("refuses an unusable clip id and ignores clip fields on other kinds", () => {
    expect(normalizeCue({ ...clipCue, clipId: "../etc/passwd" })!.clipId).toBeUndefined();
    const quote = normalizeCue({ kind: "quote", anchor: "x", quote: { text: "Hi" }, clipId: "abc123", clipPrompt: "p" })!;
    expect(quote.clipId).toBeUndefined();
    expect(quote.clipPrompt).toBeUndefined();
  });
});

describe("planning proposes clips only when asked", () => {
  const plan = (clips: boolean) =>
    normalizeVisualPlan(
      {
        sections: [
          {
            section: 1,
            cues: [
              { kind: "clip", anchor: "First the stage", layout: "side-left", clipPrompt: "A wide shot of an empty stage with soft light.", clipId: "smuggled12" },
              { kind: "clip", anchor: "Here is what you will learn", layout: "side-left" },
              { kind: "stat", anchor: "Welcome to the check", stat: { value: "1", label: "check" }, clipPrompt: "ignored" },
            ],
          },
        ],
      },
      [{ text: S1 }],
      { images: false, infographicIds: [], clips },
    )[0];

  it("drops every clip when they were not requested", () => {
    expect(plan(false).map((c) => c.kind)).toEqual(["stat"]);
  });

  it("keeps a clip with a prompt when requested, never one with an id, and drops one with no prompt", () => {
    const cues = plan(true);
    expect(cues.map((c) => c.kind)).toEqual(["stat", "clip"]);
    const clip = cues[1];
    expect(clip.clipPrompt).toMatch(/empty stage/);
    expect(clip.clipId).toBeUndefined();
    expect(cues[0].clipPrompt).toBeUndefined();
  });

  it("only mentions clips in the instruction when requested", () => {
    const base = { images: false, infographics: [] };
    expect(TRAINING_VISUALS_INSTRUCTION({ ...base })).not.toMatch(/"clip"|clipPrompt/);
    const on = TRAINING_VISUALS_INSTRUCTION({ ...base, clips: true });
    expect(on).toMatch(/"clip" — a short cinematic B-roll/);
    expect(on).toMatch(/clipPrompt/);
  });
});

describe("a clip visual on the timeline", () => {
  it("carries its clip, length and fit, and is drawn as a caption-only raster", () => {
    const i = input([{ ...clipCue, clipFit: "loop" }]);
    const tl = compileTrainingTimeline(i, timings);
    expect(tl.warnings).toEqual([]);
    const q = tl.cues.find((c) => c.kind === "clip")!;
    expect(q.clip).toEqual({ id: "abc123def456", seconds: 4, fit: "loop" });
    expect(q.rasterKey).toBeTruthy();
    expect(rasterJobs(i).some((j) => j.cueId === i.sections[0].cues![0].id)).toBe(true);
  });

  it("leaves out a clip visual that has no clip yet, with a warning, and draws nothing for it", () => {
    const i = input([{ ...clipCue, clipId: undefined }]);
    const tl = compileTrainingTimeline(i, timings);
    expect(tl.cues).toEqual([]);
    expect(tl.warnings.join(" ")).toMatch(/video clip visual at "First the stage" has no clip yet/);
    expect(rasterJobs(i).filter((j) => j.role === "cue")).toEqual([]);
  });

  it("changes nothing for a video without clips", () => {
    const plain = [{ kind: "stat", anchor: "First the stage", layout: "side-left", stat: { value: "24", label: "beds" } }];
    const tl = compileTrainingTimeline(input(plain), timings);
    expect(tl.cues.every((c) => !c.clip)).toBe(true);
    const cfg = renderConfig(tl, { output: "o.mp4", background: "#000", palette: {}, clip: () => "c.webm", raster: (k, s) => `${k}-${s}.png`, cueClip: () => "x.mp4", burnCaptions: false });
    expect(cfg.cues.every((c) => !("video" in c))).toBe(true);
    const html = buildHyperframesProject(tl, { background: "#1F2A37", clip: () => "c.webm", raster: (k, s) => `${k}-${s}.png`, cueClip: () => "x.mp4", burnCaptions: false }).html;
    expect(html).not.toMatch(/class="cv"/);
  });
});

describe("the renderers are told to play the clip", () => {
  const tl = compileTrainingTimeline(input([{ ...clipCue, clipFit: "loop" }]), timings);
  const q = tl.cues.find((c) => c.clip)!;

  it("render.py gets the clip's file, length and fit on its cue, and no clip without a resolver", () => {
    const base = { output: "o.mp4", background: "#000", palette: {}, clip: () => "c.webm", raster: (k: string, s: number) => `${k}-${s}.png`, burnCaptions: false };
    const withClip = renderConfig(tl, { ...base, cueClip: (id) => `/data/${id}.mp4` });
    expect(withClip.cues[0]).toMatchObject({ video: { src: "/data/abc123def456.mp4", seconds: 4, fit: "loop" }, start: q.start, end: q.end });
    expect(renderConfig(tl, base).cues[0]).not.toHaveProperty("video");
  });

  it("HyperFrames plays a muted video under the caption for the visual's length, without stretching it", () => {
    const project = buildHyperframesProject(tl, {
      background: "#1F2A37",
      clip: () => "c.webm",
      raster: (k, s) => `${k}-${s}.png`,
      cueClip: (cueId) => (cueId === q.id ? "/work/fitted.mp4" : "/nope.mp4"),
      burnCaptions: false,
    });
    const video = /<video id="c0v" class="cv" src="([^"]+)" muted playsinline data-start="([\d.]+)" data-duration="([\d.]+)" data-track-index="(\d+)">/.exec(project.html);
    expect(video).not.toBeNull();
    expect(Number(video![2])).toBeCloseTo(q.start);
    expect(Number(video![3])).toBeCloseTo(q.end - q.start + tl.timing.cueOut, 1);
    // The video sits under the drawing, on black, and is fitted with contain.
    expect(project.html.indexOf('id="c0v"')).toBeLessThan(project.html.indexOf('id="c0s0"'));
    expect(project.html).toMatch(/\.cue video\.cv \{[^}]*object-fit: contain/);
    expect(project.html).toMatch(/id="c0p" class="pic" style="overflow:hidden;border-radius:inherit;background:#000"/);
    expect(project.files.some((f) => f.from === "/work/fitted.mp4")).toBe(true);
    // The presenter's own video is unchanged.
    expect(project.html).toMatch(/<video id="v0" src="[^"]+" data-start="[\d.]+" data-duration="[\d.]+" data-track-index="1" playsinline>/);
  });

  it("HyperFrames draws only the caption when no clip file is supplied", () => {
    const project = buildHyperframesProject(tl, { background: "#1F2A37", clip: () => "c.webm", raster: (k, s) => `${k}-${s}.png`, burnCaptions: false });
    expect(project.html).not.toMatch(/class="cv"/);
  });
});
