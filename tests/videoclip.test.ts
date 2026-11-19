import { afterEach, describe, expect, it } from "vitest";
import {
  ASPECT_LABELS,
  clipCents,
  estimateClipCost,
  formatUsd,
  normalizeClipRequest,
  pixelSize,
  type ClipCapabilities,
} from "@/lib/videoclip";
import { CLIP_PROMPT_INSTRUCTION, normalizeClipPrompts } from "@/lib/videoclipprompt";
import { capabilitiesOf, resolveVideoSetup, videoStatus } from "@/lib/videoproviders";
import { budgetStatus, assertCanAfford, BudgetExceededError, cloudSpendLikely, reserve } from "@/lib/budget";

const caps: ClipCapabilities = {
  kind: "gemini",
  label: "Test video",
  model: "m",
  aspects: ["16:9", "9:16"],
  durations: [4, 8],
  resolutions: [
    { id: "360p", label: "360p" },
    { id: "720p", label: "720p" },
  ],
  defaultResolution: "720p",
  maxVariants: 2,
  maxClips: 4,
  referenceImage: true,
  prices: { "360p": 0.02, "720p": 0.07 },
  priceNote: "test",
};

const ok = (raw: unknown) => {
  const r = normalizeClipRequest(caps, raw);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const err = (raw: unknown) => {
  const r = normalizeClipRequest(caps, raw);
  if (r.ok) throw new Error("expected a refusal");
  return r.error;
};

describe("normalizeClipRequest", () => {
  it("fills defaults from the provider's own capabilities", () => {
    expect(ok({ prompts: ["  a   cat\nwalks "] })).toEqual({
      prompts: ["a cat walks"],
      aspect: "16:9",
      duration: 4,
      resolution: "720p",
      variants: 1,
    });
  });

  it("refuses values the provider does not support instead of rounding them", () => {
    expect(err({ prompts: ["x"], duration: 7 })).toMatch(/accepts clips of 4, 8 seconds, not 7/);
    expect(err({ prompts: ["x"], aspect: "1:1" })).toMatch(/does not offer Square 1:1/);
    expect(err({ prompts: ["x"], resolution: "4k" })).toMatch(/offers 360p, 720p/);
    expect(err({ prompts: ["x"], variants: 3 })).toMatch(/between 1 and 2/);
  });

  it("needs a prompt, and caps prompts, length and total clips", () => {
    expect(err({ prompts: ["", "  "] })).toMatch(/at least one/);
    expect(err({ prompts: ["a", "b", "c", "d"] })).toMatch(/at most 3/);
    expect(err({ prompts: ["x".repeat(1501)] })).toMatch(/under 1500/);
    expect(err({ prompts: ["a", "b", "c"], variants: 2 })).toMatch(/6 clips; the most for one run is 4/);
    expect(err("nope")).toMatch(/JSON object/);
  });

  it("accepts a reference image only when supported, and checks its type and size", () => {
    const data = Buffer.from("png-bytes").toString("base64");
    expect(ok({ prompts: ["x"], reference: { mime: "image/png", data: `data:image/png;base64,${data}` } }).reference).toEqual({
      mime: "image/png",
      data,
    });
    expect(err({ prompts: ["x"], reference: { mime: "image/gif", data } })).toMatch(/JPEG, PNG or WebP/);
    expect(err({ prompts: ["x"], reference: { mime: "image/png", data: "A".repeat(6 * 1024 * 1024) } })).toMatch(/under 4 MB/);
    const noRef = normalizeClipRequest({ ...caps, referenceImage: false }, { prompts: ["x"], reference: { mime: "image/png", data } });
    expect(noRef.ok).toBe(false);
  });
});

describe("cost estimate", () => {
  it("multiplies seconds, clips and the per-second rate, rounding cents up", () => {
    const e = estimateClipCost(caps, { prompts: ["a", "b"], variants: 2, duration: 8, resolution: "720p" });
    expect(e.clips).toBe(4);
    expect(e.secondsTotal).toBe(32);
    expect(e.perClipUsd).toBeCloseTo(0.56);
    expect(e.totalUsd).toBeCloseTo(2.24);
    expect(e.totalCents).toBe(224);
  });

  it("never rounds a fraction of a cent down", () => {
    expect(clipCents(caps, 4, "360p")).toBe(8);
    expect(clipCents({ ...caps, prices: { "720p": 0.0301 } }, 1, "720p")).toBe(4);
  });

  it("falls back to the default resolution's rate and formats dollars", () => {
    expect(estimateClipCost(caps, { prompts: ["a"], variants: 1, duration: 4, resolution: "?" }).totalUsd).toBeCloseTo(0.28);
    expect(formatUsd(0.028)).toBe("$0.028");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0)).toBe("$0.00");
  });
});

describe("pixelSize", () => {
  it("maps aspect and resolution to the sizes the Videos API takes", () => {
    expect(pixelSize("16:9", "720p")).toBe("1280x720");
    expect(pixelSize("9:16", "720p")).toBe("720x1280");
    expect(pixelSize("16:9", "1080p")).toBe("1792x1024");
    expect(pixelSize("9:16", "1792p")).toBe("1024x1792");
    expect(ASPECT_LABELS["1:1"]).toMatch(/Square/);
  });
});

describe("resolveVideoSetup", () => {
  const capsFor = (env: Record<string, string>) => {
    const s = resolveVideoSetup(env);
    if (!s.configured) throw new Error(s.reason);
    return capabilitiesOf(s.config);
  };

  it("is off with nothing set, and a GEMINI_API_KEY alone does not turn it on", () => {
    expect(resolveVideoSetup({})).toEqual({ configured: false, reason: "No video model is configured." });
    expect(resolveVideoSetup({ GEMINI_API_KEY: "k" }).configured).toBe(false);
    expect(videoStatus({}).configured).toBe(false);
  });

  it("configures Gemini with a default model and the published per-second prices", () => {
    const s = resolveVideoSetup({ AI_VIDEO_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(s.configured && s.config.kind === "gemini" && s.config.model).toBe("gemini-omni-1.2-flash");
    const c = capsFor({ AI_VIDEO_PROVIDER: "gemini", GEMINI_API_KEY: "k" });
    expect(c.durations).toEqual([3, 5, 8, 10, 15]);
    expect(c.aspects).toEqual(["16:9", "9:16"]);
    expect(c.prices["360p"]).toBe(0.023);
    expect(c.prices["720p"]).toBe(0.07);
  });

  it("infers Gemini from a gemini model name, and explains a missing key", () => {
    expect(resolveVideoSetup({ AI_VIDEO_MODEL: "gemini-omni-1.2-flash", GEMINI_API_KEY: "k" }).configured).toBe(true);
    const s = resolveVideoSetup({ AI_VIDEO_PROVIDER: "gemini" });
    expect(!s.configured && s.reason).toMatch(/GEMINI_API_KEY/);
  });

  it("configures Azure from a deployment name and requires the endpoint", () => {
    const s = resolveVideoSetup({ AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com/", AZURE_OPENAI_VIDEO_DEPLOYMENT: "vid", AZURE_OPENAI_VIDEO_API_VERSION: "preview" });
    expect(s.configured && s.config.kind).toBe("azure");
    expect(s.configured && s.config.kind === "azure" && s.config.baseUrl).toBe("https://x.openai.azure.com/openai/v1");
    expect(s.configured && s.config.kind === "azure" && s.config.query).toBe("api-version=preview");
    const noEndpoint = resolveVideoSetup({ AI_VIDEO_PROVIDER: "azure", AZURE_OPENAI_VIDEO_DEPLOYMENT: "vid" });
    expect(!noEndpoint.configured && noEndpoint.reason).toMatch(/AZURE_OPENAI_ENDPOINT/);
  });

  it("never defaults an OpenAI-compatible provider to a model, because Sora 2 is retired", () => {
    const none = resolveVideoSetup({ AI_VIDEO_PROVIDER: "openai", OPENAI_API_KEY: "k" });
    expect(!none.configured && none.reason).toMatch(/AI_VIDEO_MODEL.*Sora 2 is retired/);
    const s = resolveVideoSetup({ AI_VIDEO_BASE_URL: "http://localhost:9000/v1/", AI_VIDEO_MODEL: "my-video" });
    expect(s.configured && s.config.kind === "openai" && s.config.baseUrl).toBe("http://localhost:9000/v1");
    expect(s.configured && s.config.kind === "openai" && s.config.model).toBe("my-video");
  });

  it("lets the operator set sizes, durations and a price, and labels the default as a neutral estimate", () => {
    const def = capsFor({ AI_VIDEO_BASE_URL: "http://g/v1", AI_VIDEO_MODEL: "m" });
    expect(def.durations).toEqual([4, 8, 12]);
    expect(def.prices["720p"]).toBe(0.1);
    expect(def.priceNote).toMatch(/provider-neutral/);
    const custom = capsFor({
      AI_VIDEO_BASE_URL: "http://g/v1",
      AI_VIDEO_MODEL: "m",
      AI_VIDEO_DURATIONS: "6, 10, x",
      AI_VIDEO_ASPECTS: "9:16,1:1",
      AI_VIDEO_RESOLUTIONS: "720,1080p",
      AI_VIDEO_PRICE_PER_SECOND_USD: "0.25",
    });
    expect(custom.durations).toEqual([6, 10]);
    expect(custom.aspects).toEqual(["9:16", "1:1"]);
    expect(custom.resolutions.map((r) => r.id)).toEqual(["720p", "1080p"]);
    expect(custom.prices).toEqual({ "720p": 0.25, "1080p": 0.25 });
    expect(custom.priceNote).toMatch(/AI_VIDEO_PRICE_PER_SECOND_USD/);
  });

  it("rejects an unknown provider name", () => {
    const s = resolveVideoSetup({ AI_VIDEO_PROVIDER: "runway" });
    expect(!s.configured && s.reason).toMatch(/not a known video provider/);
  });
});

describe("clip prompt drafting", () => {
  it("accepts the requested shape, a bare array or strings, strips markup and citations, and dedupes", () => {
    const long = "A slow dolly shot across a quiet solar farm at sunrise, warm light on the panels [1]. **Single shot.**";
    expect(normalizeClipPrompts({ prompts: [{ title: "Solar sunrise", prompt: long }, { prompt: long }] })).toEqual([
      { title: "Solar sunrise", prompt: "A slow dolly shot across a quiet solar farm at sunrise, warm light on the panels . Single shot." },
    ]);
    expect(normalizeClipPrompts(["A macro shot of dew drops on a green leaf in soft morning light."])).toHaveLength(1);
    expect(normalizeClipPrompts("nonsense")).toEqual([]);
    expect(normalizeClipPrompts({ prompts: [{ prompt: "too short" }] })).toEqual([]);
  });

  it("caps the number of drafts and gives untitled ones a title", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ prompt: `Shot number ${i} of a calm harbor at dusk with gentle waves rolling in.` }));
    const out = normalizeClipPrompts({ prompts: many });
    expect(out).toHaveLength(3);
    expect(out[0].title).toBeTruthy();
  });

  it("tells the model to avoid on-screen text, real people and brands", () => {
    const text = CLIP_PROMPT_INSTRUCTION(2, { aspect: "9:16", duration: 8, topic: "solar power" });
    expect(text).toMatch(/No text, captions, logos/);
    expect(text).toMatch(/No real people/);
    expect(text).toMatch(/solar power/);
    expect(text).toMatch(/Portrait 9:16/);
    expect(text).toMatch(/exactly 2 prompts/);
  });
});

describe("video spend and the daily budget", () => {
  afterEach(() => {
    delete process.env.DAILY_BUDGET_USD;
    delete process.env.AI_VIDEO_PROVIDER;
    delete process.env.AI_VIDEO_BASE_URL;
    delete process.env.AI_BASE_URL;
  });

  it("counts a configured video model as billed spend even with a local chat model", () => {
    process.env.AI_BASE_URL = "http://127.0.0.1:8080/v1";
    expect(cloudSpendLikely()).toBe(false);
    process.env.AI_VIDEO_PROVIDER = "gemini";
    expect(cloudSpendLikely()).toBe(true);
  });

  it("refuses a job that cannot fit without recording any spend", () => {
    process.env.DAILY_BUDGET_USD = "1";
    const before = budgetStatus().spentCents;
    expect(() => assertCanAfford(5_000)).toThrow(BudgetExceededError);
    expect(() => assertCanAfford(5_000)).toThrow(/would cost about \$50\.00/);
    assertCanAfford(10);
    expect(budgetStatus().spentCents).toBe(before);
    reserve("video", 10);
    expect(budgetStatus().spentCents).toBe(before + 10);
  });
});
