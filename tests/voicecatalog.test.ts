import { describe, expect, it } from "vitest";
import { AVATAR_PRESETS, presenterVoice } from "@/lib/avatars";
import { buildTrainingSsml, voiceSsml } from "@/lib/training";
import { toCatalog } from "@/lib/voicelist";
import {
  cleanStyle,
  groupVoices,
  isVoiceId,
  usableStyles,
  voiceNickname,
  voiceServiceName,
} from "@/lib/voicecatalog";

const sections = [{ title: "One", text: "Hello & welcome.\n\nSecond paragraph." }];

describe("voice ids and styles", () => {
  it("accepts full service names and rejects anything else", () => {
    expect(isVoiceId("en-US-JennyNeural")).toBe(true);
    expect(isVoiceId("en-US-Ava:DragonHDLatestNeural")).toBe(true);
    expect(isVoiceId("Ava")).toBe(false);
    expect(isVoiceId("en-US-Jenny'/><break/>")).toBe(false);
  });

  it("only passes safe style names through", () => {
    expect(cleanStyle("newscast-casual")).toBe("newscast-casual");
    expect(cleanStyle("x' onload='")).toBeUndefined();
    expect(cleanStyle(7)).toBeUndefined();
  });

  it("keeps pinned speaker keys and full names, and falls back for the rest", () => {
    expect(presenterVoice("ava", "Emma")).toBe("Ava");
    expect(presenterVoice("en-US-JennyNeural", "Emma")).toBe("en-US-JennyNeural");
    expect(presenterVoice("nobody", "Emma")).toBe("Emma");
    expect(voiceServiceName("Ava")).toBe("en-US-AvaMultilingualNeural");
    expect(voiceServiceName("en-US-JennyNeural")).toBe("en-US-JennyNeural");
    expect(voiceServiceName("nobody")).toBe("en-US-AvaMultilingualNeural");
  });

  it("names voices readably", () => {
    expect(voiceNickname("Ava")).toBe("Ava");
    expect(voiceNickname("en-US-JennyNeural")).toBe("Jenny");
    expect(voiceNickname("en-US-AndrewMultilingualNeural")).toBe("Andrew Multilingual");
    expect(voiceNickname("en-US-Olivia:MAI-Voice-2")).toBe("Olivia");
  });

  it("every preset's default voice resolves to a service voice", () => {
    for (const p of Object.values(AVATAR_PRESETS)) {
      expect(isVoiceId(voiceServiceName(p.voice))).toBe(true);
    }
  });
});

describe("training SSML", () => {
  it("is unchanged for the default delivery, so rendered clips stay cached", () => {
    const ssml = buildTrainingSsml(sections, "Ava");
    expect(ssml).toContain("<voice name='en-US-AvaMultilingualNeural'>");
    expect(ssml).not.toContain("express-as");
  });

  it("wraps the speech in the chosen style", () => {
    const ssml = buildTrainingSsml(sections, "en-US-JennyNeural", "cheerful");
    expect(ssml).toContain(
      "<voice name='en-US-JennyNeural'><mstts:express-as style='cheerful'>"
    );
    expect(ssml).toContain("</mstts:express-as></voice>");
    expect(ssml).toContain("Hello &amp; welcome.");
  });

  it("drops a style name that is not a plain word", () => {
    expect(voiceSsml("en-US-JennyNeural", "x", "bad'><x")).not.toContain("express-as");
  });
});

describe("voice catalog", () => {
  const list = [
    { ShortName: "en-US-JennyNeural", DisplayName: "Jenny", Gender: "Female", Locale: "en-US", VoiceType: "Neural", Status: "GA", StyleList: ["cheerful", "sad"] },
    { ShortName: "en-US-TonyNeural", DisplayName: "Tony", Gender: "Male", Locale: "en-US", VoiceType: "Neural", Status: "GA", StyleList: ["sad", "unfriendly"] },
    { ShortName: "en-US-Ava:DragonHDLatestNeural", DisplayName: "Ava HD", Gender: "Female", Locale: "en-US", VoiceType: "NeuralHD", Status: "GA" },
    { ShortName: "en-US-Olivia:MAI-Voice-2", DisplayName: "Olivia MAI-Voice-2", Gender: "Female", Locale: "en-US", VoiceType: "NeuralHD", Status: "Preview", StyleList: ["happy"] },
    { ShortName: "en-US-Olivia:MAI-Voice-2.1", DisplayName: "Olivia 2.1", Gender: "Female", Locale: "en-US", VoiceType: "NeuralHD", Status: "Preview" },
    { ShortName: "en-US-Early", Locale: "en-US", Status: "Preview" },
    { ShortName: "en-Multitalker:DragonHDLatestNeural", Locale: "en-US", Status: "GA" },
    { ShortName: "fr-FR-DeniseNeural", Locale: "fr-FR", Status: "GA" },
  ];

  it("offers GA en-US voices plus MAI-Voice-2, and nothing else", () => {
    expect(toCatalog(list).map((v) => v.id)).toEqual([
      "en-US-JennyNeural",
      "en-US-TonyNeural",
      "en-US-Ava:DragonHDLatestNeural",
      "en-US-Olivia:MAI-Voice-2",
    ]);
  });

  it("hides styles measured to do nothing", () => {
    expect(usableStyles("en-US-TonyNeural", ["sad", "unfriendly"])).toEqual(["sad"]);
    expect(toCatalog(list).find((v) => v.id === "en-US-TonyNeural")?.styles).toEqual(["sad"]);
  });

  it("flags preview and HD voices and groups them for the picker", () => {
    const voices = toCatalog(list);
    expect(voices.find((v) => v.id === "en-US-Olivia:MAI-Voice-2")?.preview).toBe(true);
    expect(voices.find((v) => v.id.startsWith("en-US-Ava:"))?.hd).toBe(true);
    expect(groupVoices(voices).map((g) => g.label)).toEqual([
      "With speaking styles",
      "HD voices",
      "Preview",
    ]);
  });
});
