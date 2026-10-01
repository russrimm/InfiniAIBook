import { describe, expect, it } from "vitest";
import { LANGUAGES, detectLanguage, soundsConfused } from "@/lib/languages";
import { PERSONAS, REALTIME_VOICES, personasFor, resolvePersona, shortName } from "@/lib/personas";
import { SCENARIOS } from "@/lib/scenarios";

describe("language config", () => {
  it("has unique codes and at least one partner per language", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const l of LANGUAGES) expect(personasFor(l.code).length).toBeGreaterThan(0);
  });

  it("gives every partner a valid realtime voice and a known language", () => {
    for (const p of PERSONAS) {
      expect(REALTIME_VOICES).toContain(p.voice);
      expect(LANGUAGES.some((l) => l.code === p.language)).toBe(true);
    }
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
  });

  it("gives every scenario unique goal ids", () => {
    for (const s of SCENARIOS) {
      const ids = s.goals.map((g) => g.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("falls back to the language's first partner when the chosen one is for another language", () => {
    expect(resolvePersona("fr", "es-lucia").language).toBe("fr");
    expect(resolvePersona("es", "es-mateo").id).toBe("es-mateo");
  });

  it("drops the native-script name for labels", () => {
    expect(shortName(resolvePersona("zh", "zh-lin"))).toBe("Lín Xiǎoyǔ");
  });
});

describe("detectLanguage", () => {
  it("tells Latin-script languages apart by common words", () => {
    expect(detectLanguage("Hola, quiero un café con leche, por favor", ["es", "en"])).toBe("es");
    expect(detectLanguage("I would like a coffee please", ["es", "en"])).toBe("en");
    expect(detectLanguage("Je voudrais un café, s'il vous plaît, merci", ["fr", "en"])).toBe("fr");
    expect(detectLanguage("Ich habe heute keine Zeit, aber danke", ["de", "en"])).toBe("de");
  });

  it("identifies non-Latin scripts", () => {
    expect(detectLanguage("こんにちは、元気ですか", ["ja", "en"])).toBe("ja");
    expect(detectLanguage("我想喝咖啡", ["zh", "en"])).toBe("zh");
    expect(detectLanguage("안녕하세요", ["ko", "en"])).toBe("ko");
    expect(detectLanguage("नमस्ते, आप कैसे हैं", ["hi", "en"])).toBe("hi");
    expect(detectLanguage("مرحبا، كيف حالك", ["ar", "en"])).toBe("ar");
  });

  it("uses kana to tell Japanese from Chinese", () => {
    expect(detectLanguage("日本語を勉強しています", ["ja", "zh"])).toBe("ja");
    expect(detectLanguage("我在学习日本语", ["ja", "zh"])).toBe("zh");
  });

  it("spots the support language in a non-Latin target practice", () => {
    expect(detectLanguage("sorry, what does that mean", ["ja", "en"])).toBe("en");
  });

  it("returns null when it cannot tell", () => {
    expect(detectLanguage("", ["es", "en"])).toBeNull();
    expect(detectLanguage("ok", ["es", "en"])).toBeNull();
  });
});

describe("soundsConfused", () => {
  it("catches help phrases in either language", () => {
    expect(soundsConfused("Perdón, no entiendo", ["es", "en"])).toBe(true);
    expect(soundsConfused("Sorry, I don't understand", ["es", "en"])).toBe(true);
    expect(soundsConfused("すみません、わかりません", ["ja", "en"])).toBe(true);
    expect(soundsConfused("Me gusta el fútbol", ["es", "en"])).toBe(false);
  });
});
