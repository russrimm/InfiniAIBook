import { describe, expect, it } from "vitest";
import {
  INITIAL_POLICY,
  INITIAL_SCAFFOLD,
  analyzeTurn,
  coachNote,
  composeInstructions,
  outputSpeed,
  updateScaffold,
  type TurnSignal,
} from "@/lib/policy";
import { buildSessionConfig, buildSessionUpdate } from "@/lib/realtimeConfig";
import { SetupSchema, resolveSetup, setupFromParams, setupToParams } from "@/lib/setup";
import { TOOLS } from "@/lib/tools";

const setup = (over: Record<string, unknown> = {}) =>
  resolveSetup(SetupSchema.parse({ target: "es", support: "en", level: "B1", scenario: "cafe", ...over }));

const signal = (over: Partial<TurnSignal> = {}): TurnSignal => ({
  replyLanguage: "target",
  confused: false,
  corrections: 0,
  words: 6,
  afterSilence: false,
  ...over,
});

describe("setup", () => {
  it("refuses the same language twice", () => {
    expect(SetupSchema.safeParse({ target: "es", support: "es", level: "A1" }).success).toBe(false);
  });

  it("round-trips through URL params", () => {
    const s = SetupSchema.parse({ target: "ja", support: "en", level: "A2", scenario: "hotel", persona: "ja-kenji", learnerName: "Sam" });
    expect(setupFromParams(setupToParams(s))).toEqual(s);
  });

  it("rejects names with markup", () => {
    expect(SetupSchema.safeParse({ target: "es", support: "en", level: "A1", learnerName: "<b>x</b>" }).success).toBe(false);
  });
});

describe("composeInstructions", () => {
  it("names the languages and leaves no placeholders", () => {
    const text = composeInstructions(setup());
    expect(text).toContain("Spanish");
    expect(text).toContain("English");
    expect(text).not.toMatch(/\bTARGET\b|\bSUPPORT\b/);
    expect(text).toContain("Lucía");
    expect(text).toContain("café");
  });

  it("lists the scenario goals by id", () => {
    const text = composeInstructions(setup());
    expect(text).toContain("- order: Order a drink and something to eat");
  });

  it("adds struggle guidance as the scaffold rises", () => {
    const calm = composeInstructions(setup(), INITIAL_POLICY);
    const lost = composeInstructions(setup(), { ...INITIAL_POLICY, scaffold: 3 });
    expect(calm).not.toContain("the learner is lost");
    expect(lost).toContain("the learner is lost: switch to English");
  });

  it("keeps to the target language under the immersion lock", () => {
    const text = composeInstructions(setup(), { ...INITIAL_POLICY, immersionLock: true });
    expect(text).toContain("full immersion: stay in Spanish");
    expect(text).not.toContain("Rescue:");
  });

  it("has no blank lines from omitted sections", () => {
    expect(composeInstructions(setup())).not.toMatch(/Switching rules:\n(?:.*\n)*?\n- Each time/);
  });
});

describe("coachNote", () => {
  it("fills in language names", () => {
    expect(coachNote("explain", setup())).toContain("'Explain in English'");
    expect(coachNote("hint", setup({ target: "fr" }))).toContain("French phrases");
  });
});

describe("outputSpeed", () => {
  it("slows with each request and stays in range", () => {
    const s = setup({ level: "A1" });
    expect(outputSpeed(s, INITIAL_POLICY)).toBe(0.85);
    expect(outputSpeed(s, { ...INITIAL_POLICY, slower: 1 })).toBe(0.75);
    expect(outputSpeed(s, { ...INITIAL_POLICY, slower: 3, scaffold: 3 })).toBe(0.7);
  });
});

describe("updateScaffold", () => {
  it("rises fast on confusion and falls after two clean turns", () => {
    let st = updateScaffold(INITIAL_SCAFFOLD, signal({ confused: true }), "B1");
    expect(st.state.scaffold).toBe(2);
    expect(st.changed).toBe(true);
    st = updateScaffold(st.state, signal(), "B1");
    expect(st.state.scaffold).toBe(2);
    expect(st.changed).toBe(false);
    st = updateScaffold(st.state, signal(), "B1");
    expect(st.state.scaffold).toBe(1);
    expect(st.changed).toBe(true);
  });

  it("does not count support-language replies as struggle at A1", () => {
    expect(updateScaffold(INITIAL_SCAFFOLD, signal({ replyLanguage: "support" }), "A1").state.scaffold).toBe(0);
    expect(updateScaffold(INITIAL_SCAFFOLD, signal({ replyLanguage: "support" }), "B1").state.scaffold).toBe(1);
  });

  it("caps at 3", () => {
    let st = INITIAL_SCAFFOLD;
    for (let i = 0; i < 5; i++) st = updateScaffold(st, signal({ confused: true, afterSilence: true }), "B2").state;
    expect(st.scaffold).toBe(3);
  });

  it("resets the clean streak on a neutral turn", () => {
    const one = updateScaffold({ scaffold: 1, cleanStreak: 0 }, signal(), "B1").state;
    const neutral = updateScaffold(one, signal({ words: 1 }), "B1").state;
    expect(neutral).toEqual({ scaffold: 1, cleanStreak: 0 });
  });
});

describe("analyzeTurn", () => {
  it("reads language and confusion from the learner's words", () => {
    const s = setup();
    expect(analyzeTurn("No entiendo, perdón", s, { corrections: 0, afterSilence: false })).toMatchObject({
      replyLanguage: "target",
      confused: true,
    });
    expect(analyzeTurn("What does that mean?", s, { corrections: 1, afterSilence: true })).toMatchObject({
      replyLanguage: "support",
      confused: true,
      corrections: 1,
      afterSilence: true,
    });
  });
});

describe("session config", () => {
  it("builds the GA realtime session", () => {
    const cfg = buildSessionConfig(setup(), { model: "gpt-realtime", transcriptionModel: "gpt-4o-transcribe" });
    expect(cfg.type).toBe("realtime");
    expect(cfg.model).toBe("gpt-realtime");
    expect(cfg.audio.output.voice).toBe("coral");
    expect(cfg.audio.input.turn_detection).toMatchObject({ type: "semantic_vad", interrupt_response: true });
    expect(cfg.audio.input).toHaveProperty("transcription.model", "gpt-4o-transcribe");
    expect(cfg.tools).toBe(TOOLS);
  });

  it("omits transcription when disabled", () => {
    const cfg = buildSessionConfig(setup(), { model: "m", transcriptionModel: null });
    expect(cfg.audio.input).not.toHaveProperty("transcription");
  });

  it("updates instructions and speed without touching the voice", () => {
    const upd = buildSessionUpdate(setup(), { ...INITIAL_POLICY, scaffold: 2 });
    expect(upd.type).toBe("session.update");
    expect(upd.session.audio.output).not.toHaveProperty("voice");
    expect(upd.session.audio.input.turn_detection.eagerness).toBe("low");
  });
});
