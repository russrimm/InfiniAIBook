import { describe, expect, it } from "vitest";
import { POST as estimateRoute } from "@/app/api/estimate/route";
import { DEFAULT_RATES, avatarCents, rates, speechCents } from "@/lib/budget";
import { confirmAboveCents, estimateGeneration, formatUsd } from "@/lib/estimates";

const R = DEFAULT_RATES;

describe("cost rates", () => {
  it("default to the budget's rough prices and accept PRICE_* overrides", () => {
    expect(rates({})).toEqual(R);
    expect(rates({ PRICE_IMAGE_CENTS: "20", PRICE_STUDIO_CALL_CENTS: "0", PRICE_SPEECH_PER_1K_CHARS_CENTS: "abc", PRICE_AVATAR_PER_150_WORDS_CENTS: "-5" })).toEqual({
      ...R,
      image: 20,
      studioCall: 0,
    });
  });

  it("charges at least the minimum per speech call and per avatar render", () => {
    expect(speechCents(100, R)).toBe(4);
    expect(speechCents(5000, R)).toBe(15);
    expect(avatarCents(10, R)).toBe(25);
    expect(avatarCents(1500, R)).toBe(400);
  });
});

describe("estimateGeneration", () => {
  const lineTotal = (e: NonNullable<ReturnType<typeof estimateGeneration>>) => e.lines.reduce((s, l) => s + l.cents, 0);

  it("prices a text format as one model call", () => {
    for (const type of ["report", "quiz", "flashcards", "mindmap", "slides", "study_guide"]) {
      expect(estimateGeneration(type, {}, R)?.cents).toBe(R.studioCall);
    }
    expect(estimateGeneration("clip", {}, R)).toBeNull();
    expect(estimateGeneration("nonsense", {}, R)).toBeNull();
  });

  it("adds a picture to an image-style infographic only", () => {
    const text = estimateGeneration("infographic", { style: "classic" }, R)!;
    const picture = estimateGeneration("infographic", { style: "image" }, R)!;
    expect(text.cents).toBeLessThan(picture.cents);
    expect(picture.cents - text.cents).toBe(R.image);
  });

  it("scales a whiteboard video with its scenes and skips the cached hand", () => {
    const short = estimateGeneration("video", { length: "short" }, R, true)!;
    const long = estimateGeneration("video", { length: "long" }, R, true)!;
    const custom = estimateGeneration("video", { length: "custom", scenes: 8 }, R, false)!;
    expect(long.cents).toBeGreaterThan(short.cents);
    expect(short.cents).toBe(R.studioCall + 3 * R.image + 3 * speechCents(280, R));
    expect(custom.cents).toBe(R.studioCall + 8 * R.image + R.image + 8 * speechCents(280, R));
    expect(lineTotal(short)).toBe(short.cents);
  });

  it("prices a motion explainer by scenes and character", () => {
    const withHero = estimateGeneration("motion", { length: "standard", character: "auto" }, R)!;
    const noHero = estimateGeneration("motion", { length: "standard", character: "none" }, R)!;
    expect(withHero.cents - noHero.cents).toBe(R.image);
  });

  it("prices an audio overview by length", () => {
    const short = estimateGeneration("podcast", { length: "short" }, R)!;
    const long = estimateGeneration("podcast", { length: "long" }, R)!;
    expect(long.cents).toBeGreaterThan(short.cents);
    expect(short.lines[0].label).toMatch(/script/i);
  });

  it("prices a training video with presenter time, and pictures only when composed", () => {
    const composed = estimateGeneration("training", { length: "medium", composition: { mode: "composed" } }, R)!;
    const presenter = estimateGeneration("training", { length: "medium", composition: { mode: "presenter" } }, R)!;
    expect(composed.cents).toBeGreaterThan(presenter.cents);
    expect(presenter.lines.some((l) => /Presenter video/.test(l.label))).toBe(true);
  });

  it("formats tiny amounts honestly", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(8)).toBe("$0.08");
    expect(formatUsd(250)).toBe("$2.50");
  });

  it("asks for confirmation from $1 by default, and COST_CONFIRM_USD changes or disables it", () => {
    expect(confirmAboveCents({})).toBe(100);
    expect(confirmAboveCents({ COST_CONFIRM_USD: "2.5" })).toBe(250);
    expect(confirmAboveCents({ COST_CONFIRM_USD: "0" })).toBeNull();
  });
});

describe("POST /api/estimate", () => {
  const post = (body: unknown) =>
    estimateRoute(new Request("http://localhost/api/estimate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

  it("returns the estimate, its breakdown and whether today's budget can pay for it", async () => {
    const res = await post({ type: "video", length: "short" });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { cents: number; display: string; lines: { label: string }[]; fits: boolean; budget: { enabled: boolean } };
    expect(j.cents).toBeGreaterThan(0);
    expect(j.display).toMatch(/^\$\d+\.\d\d$/);
    expect(j.lines.length).toBeGreaterThan(1);
    expect(typeof j.fits).toBe("boolean");
  });

  it("refuses an unknown type and a non-object body", async () => {
    expect((await post({ type: "mystery" })).status).toBe(400);
    expect((await post([1])).status).toBe(400);
  });

  it("says when the budget cannot pay for it", async () => {
    const before = process.env.DAILY_BUDGET_USD;
    process.env.DAILY_BUDGET_USD = "0.01";
    try {
      const j = (await (await post({ type: "video", length: "long" })).json()) as { fits: boolean; message: string };
      expect(j.fits).toBe(false);
      expect(j.message).toMatch(/DAILY_BUDGET_USD/);
    } finally {
      if (before === undefined) delete process.env.DAILY_BUDGET_USD;
      else process.env.DAILY_BUDGET_USD = before;
    }
  });
});
