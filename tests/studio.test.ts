import { describe, expect, it } from "vitest";
import { STUDIO, studioIcon, studioLabel } from "@/lib/studio";

describe("studioLabel / studioIcon", () => {
  it("uses the known label and icon", () => {
    expect(studioLabel("motion")).toBe("Motion explainer");
    expect(studioIcon("slides")).toBe(STUDIO.slides.icon);
  });

  it("falls back to a readable name for types this build does not know", () => {
    expect(studioLabel("audio_deck")).toBe("Audio deck");
    expect(studioIcon("audio_deck")).toBe("📄");
  });

  it("never treats prototype keys as known types", () => {
    expect(studioLabel("constructor")).toBe("Constructor");
    expect(studioIcon("toString")).toBe("📄");
  });
});
