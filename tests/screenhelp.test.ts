import { describe, expect, it } from "vitest";
import {
  ScreenHelpRequestSchema,
  fitFrame,
  frameDiff,
  normalizeBox,
  parseReply,
  sessionNote,
  shouldWatch,
  toGray,
  trimHistory,
  turnPrompt,
} from "@/lib/screenhelp";

const FRAME = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("ScreenHelpRequestSchema", () => {
  const base = { goal: "Add a filter", trigger: "ask", frame: FRAME, width: 1600, height: 900 };

  it("accepts a valid turn and defaults history", () => {
    const r = ScreenHelpRequestSchema.parse(base);
    expect(r.history).toEqual([]);
  });

  it("rejects an empty goal, a bad trigger and non-image frames", () => {
    expect(ScreenHelpRequestSchema.safeParse({ ...base, goal: "  " }).success).toBe(false);
    expect(ScreenHelpRequestSchema.safeParse({ ...base, trigger: "spy" }).success).toBe(false);
    expect(ScreenHelpRequestSchema.safeParse({ ...base, frame: "https://example.com/x.png" }).success).toBe(false);
    expect(
      ScreenHelpRequestSchema.safeParse({ ...base, frame: "data:image/svg+xml;base64,PHN2Zz4=" }).success
    ).toBe(false);
  });
});

describe("normalizeBox", () => {
  it("converts pixels to fractions", () => {
    expect(normalizeBox({ x: 160, y: 90, w: 320, h: 45, label: "Share" }, 1600, 900)).toEqual({
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.05,
      label: "Share",
    });
  });

  it("keeps boxes already given as fractions", () => {
    expect(normalizeBox({ x: 0.5, y: 0.25, w: 0.1, h: 0.05 }, 1600, 900)).toMatchObject({
      x: 0.5,
      y: 0.25,
      w: 0.1,
      h: 0.05,
      label: "",
    });
  });

  it("accepts width/height names and numeric strings", () => {
    expect(normalizeBox({ x: "800", y: "450", width: "160", height: "90" }, 1600, 900)).toMatchObject({
      x: 0.5,
      y: 0.5,
      w: 0.1,
      h: 0.1,
    });
  });

  it("clips boxes that run off the edge", () => {
    const b = normalizeBox({ x: 1500, y: 850, w: 400, h: 200 }, 1600, 900)!;
    expect(b.x + b.w).toBeLessThanOrEqual(1);
    expect(b.y + b.h).toBeLessThanOrEqual(1);
  });

  it("drops unusable boxes", () => {
    expect(normalizeBox(null, 100, 100)).toBeNull();
    expect(normalizeBox({ x: 1, y: 1 }, 100, 100)).toBeNull();
    expect(normalizeBox({ x: -5, y: 1, w: 10, h: 10 }, 100, 100)).toBeNull();
    expect(normalizeBox({ x: 0, y: 0, w: 0, h: 10 }, 100, 100)).toBeNull();
    expect(normalizeBox({ x: 2000, y: 10, w: 10, h: 10 }, 1600, 900)).toBeNull();
    // Most of the screen is not a control.
    expect(normalizeBox({ x: 0, y: 0, w: 1500, h: 800 }, 1600, 900)).toBeNull();
  });
});

describe("parseReply", () => {
  it("parses a next step with a target", () => {
    const r = parseReply(
      { status: "next_step", say: "Open **File**.", step: "Click File", target: { x: 10, y: 10, w: 40, h: 20, label: "File" } },
      400,
      200
    );
    expect(r.status).toBe("next_step");
    expect(r.step).toBe("Click File");
    expect(r.target).toMatchObject({ x: 0.025, y: 0.05, w: 0.1, h: 0.1, label: "File" });
  });

  it("ignores targets unless there is a next step", () => {
    const r = parseReply({ status: "done", say: "Done!", target: { x: 1, y: 1, w: 10, h: 10 } }, 100, 100);
    expect(r.target).toBeNull();
  });

  it("falls back to an answer for unknown statuses and uses the step as text", () => {
    const r = parseReply({ status: "weird", step: "Click Save" }, 100, 100);
    expect(r.status).toBe("answer");
    expect(r.say).toBe("Click Save");
  });

  it("treats a literal null step as none", () => {
    expect(parseReply({ status: "answer", say: "Hi", step: "null" }, 100, 100).step).toBeNull();
  });

  it("survives garbage", () => {
    expect(parseReply("nope", 100, 100)).toEqual({ status: "answer", say: "", step: null, target: null });
  });
});

describe("trimHistory", () => {
  it("keeps the most recent turns within budget, oldest first", () => {
    const h = [
      { role: "user" as const, text: "a".repeat(50) },
      { role: "assistant" as const, text: "b".repeat(50) },
      { role: "user" as const, text: "  " },
      { role: "user" as const, text: "c".repeat(50) },
    ];
    const out = trimHistory(h, 120);
    expect(out.map((t) => t.text[0])).toEqual(["b", "c"]);
  });
});

describe("turnPrompt", () => {
  it("describes the trigger", () => {
    const base = { goal: "Rename a file", width: 800, height: 600 };
    expect(turnPrompt({ ...base, trigger: "ask", message: "Rename a file" })).toContain("start of the session");
    expect(turnPrompt({ ...base, trigger: "ask", message: "Where is it?" })).toContain("The user says: Where is it?");
    expect(turnPrompt({ ...base, trigger: "watch" })).toContain('"unchanged"');
    expect(turnPrompt({ ...base, trigger: "watch" })).toContain("800 × 600");
  });
});

describe("frameDiff and toGray", () => {
  it("measures the changed share of pixels", () => {
    const a = new Uint8Array([0, 0, 0, 0]);
    const b = new Uint8Array([0, 100, 0, 10]);
    expect(frameDiff(a, a)).toBe(0);
    expect(frameDiff(a, b)).toBe(0.25);
    expect(frameDiff(a, new Uint8Array(3))).toBe(1);
  });

  it("converts RGBA to luminance", () => {
    expect(Array.from(toGray([255, 255, 255, 255, 0, 0, 0, 255]))).toEqual([255, 0]);
  });
});

describe("shouldWatch", () => {
  const base = {
    enabled: true,
    hasGoal: true,
    inFlight: false,
    sinceLastRequestMs: 60_000,
    changedFromAnalyzed: 0.1,
    changedFromPrevSample: 0,
  };

  it("fires when the screen changed and settled", () => {
    expect(shouldWatch(base)).toBe(true);
  });

  it("waits while the screen is still moving", () => {
    expect(shouldWatch({ ...base, changedFromPrevSample: 0.2 })).toBe(false);
  });

  it("does not fire without a real change, too soon, mid-request, or when off", () => {
    expect(shouldWatch({ ...base, changedFromAnalyzed: 0.001 })).toBe(false);
    expect(shouldWatch({ ...base, sinceLastRequestMs: 1000 })).toBe(false);
    expect(shouldWatch({ ...base, inFlight: true })).toBe(false);
    expect(shouldWatch({ ...base, enabled: false })).toBe(false);
    expect(shouldWatch({ ...base, hasGoal: false })).toBe(false);
  });
});

describe("fitFrame", () => {
  it("scales down to the longest edge without upscaling", () => {
    expect(fitFrame(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(fitFrame(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("sessionNote", () => {
  it("lists steps and the conversation without screenshots", () => {
    const { title, content } = sessionNote({
      goal: "Add a filter",
      date: new Date("2026-01-02T15:04:00Z"),
      turns: [
        { role: "user", text: "Add a filter" },
        { role: "assistant", text: "Open the **Data** tab.", step: "Click Data" },
        { role: "assistant", text: "Now pick Filter.", step: "Click Filter", auto: true },
      ],
    });
    expect(title).toBe("Screen help: Add a filter");
    expect(content).toContain("1. Click Data\n2. Click Filter");
    expect(content).toContain("**You:** Add a filter");
    expect(content).toContain("**Helper (noticed a change):** Now pick Filter.");
    expect(content).not.toContain("data:image");
  });

  it("shortens long goals in the title", () => {
    const { title } = sessionNote({ goal: "x".repeat(200), turns: [], date: new Date() });
    expect(title.length).toBeLessThan(90);
  });
});
