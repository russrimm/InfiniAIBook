import { describe, expect, it } from "vitest";
import { AVATAR_PRESETS } from "@/lib/avatars";
import {
  hdCandidates,
  omniVoice,
  PINNED_GENDER,
  PINNED_VOICES,
} from "@/lib/voices";

describe("presenter voices", () => {
  it("knows the gender of every pinned voice", () => {
    expect(Object.keys(PINNED_GENDER).sort()).toEqual(
      Object.keys(PINNED_VOICES).sort(),
    );
  });

  it("pairs every presenter with a pinned voice of the same gender", () => {
    for (const [key, p] of Object.entries(AVATAR_PRESETS)) {
      expect(PINNED_VOICES[p.voice], `${key} voice ${p.voice}`).toBeTruthy();
      expect(
        PINNED_GENDER[p.voice],
        `${key} (${p.gender}) voice ${p.voice}`,
      ).toBe(p.gender);
    }
  });

  it("has a picture for every presenter", async () => {
    const { existsSync } = await import("node:fs");
    for (const key of Object.keys(AVATAR_PRESETS)) {
      expect(existsSync(`public/avatars/${key}.png`), key).toBe(true);
    }
  });
});

describe("HD voice candidates", () => {
  it("derives the Dragon HD Omni name for any pinned voice", () => {
    expect(omniVoice("en-US-EvelynMultilingualNeural")).toBe(
      "en-US-Evelyn:DragonHDOmniLatestNeural",
    );
    expect(omniVoice("en-US-JaneNeural")).toBe(
      "en-US-Jane:DragonHDOmniLatestNeural",
    );
  });

  it("tries DragonHD before Omni", () => {
    expect(hdCandidates("Ava")).toEqual([
      "en-US-Ava:DragonHDLatestNeural",
      "en-US-Ava:DragonHDOmniLatestNeural",
    ]);
    expect(hdCandidates("Bree")).toEqual([]);
  });
});
