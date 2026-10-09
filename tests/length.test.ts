import { describe, expect, it } from "vitest";
import { STUDIO } from "@/lib/studio";
import {
  PLAN_INSTRUCTION,
  WHITEBOARD_LENGTHS,
  normalizeScenePlan,
  whiteboardSize,
} from "@/lib/whiteboard";
import type { ArtifactType } from "@/lib/types";

describe("whiteboard length", () => {
  it("defaults to standard and rejects unknown values", () => {
    expect(whiteboardSize(undefined).length).toBe("standard");
    expect(whiteboardSize("huge").scenes).toBe(WHITEBOARD_LENGTHS.standard.scenes);
    expect(whiteboardSize("short").scenes).toBe(3);
    expect(whiteboardSize("long").scenes).toBe(15);
  });

  it("uses a custom scene count, clamped to the allowed range", () => {
    expect(whiteboardSize("custom", 12).scenes).toBe(12);
    expect(whiteboardSize("custom", 1).scenes).toBe(3);
    expect(whiteboardSize("custom", 999).scenes).toBe(30);
    expect(whiteboardSize("custom", "abc").scenes).toBe(6);
    expect(whiteboardSize("short", 20).scenes).toBe(3);
  });

  it("plans the scene count for the chosen length", () => {
    expect(PLAN_INSTRUCTION("")).toContain("Plan a 6-scene video");
    expect(PLAN_INSTRUCTION("", whiteboardSize("short"))).toContain("Plan a 3-scene video");
    expect(PLAN_INSTRUCTION("", whiteboardSize("custom", 20))).toContain("20. Closing");
  });

  it("keeps only as many scenes as were asked for plus a little slack", () => {
    const scene = { title: "T", drawing: "d", narration: "n" };
    const raw = { scenes: Array.from({ length: 40 }, () => scene) };
    expect(normalizeScenePlan(raw, 8)!.scenes).toHaveLength(8);
    expect(normalizeScenePlan(raw)!.scenes).toHaveLength(30);
  });
});

describe("document length", () => {
  const sized: ArtifactType[] = [
    "report",
    "briefing",
    "study_guide",
    "faq",
    "mindmap",
    "timeline",
  ];

  it("marks every document-style format as sized", () => {
    for (const t of sized) expect(STUDIO[t].sized).toBe(true);
  });

  it("changes the prompt with the length and keeps standard as the default", () => {
    for (const t of sized) {
      const standard = STUDIO[t].instruction("");
      expect(STUDIO[t].instruction("", { length: "standard" })).toBe(standard);
      expect(STUDIO[t].instruction("", { length: "short" })).not.toBe(standard);
      expect(STUDIO[t].instruction("", { length: "long" })).not.toBe(standard);
    }
  });
});
