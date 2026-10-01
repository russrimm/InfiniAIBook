/**
 * CEFR levels and how each one shapes the conversation: how much of the
 * target language the partner uses, how fast they speak, and how long they
 * wait before helping a learner who has gone quiet.
 */

export const LEVEL_IDS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export type Level = {
  id: LevelId;
  label: string;
  summary: string;
  /** Rough share of the partner's speech in the target language, 0–1. */
  targetShare: number;
  /** Realtime output speed multiplier (the API accepts 0.25–1.5). */
  speed: number;
  /** Semantic VAD eagerness: low waits longer before deciding the learner is done. */
  eagerness: "low" | "medium" | "high" | "auto";
  /** Seconds of learner silence, after the partner stops talking, before a gentle nudge. */
  silenceSec: number;
  /** Immersion policy, spoken to the model. */
  policy: string;
};

export const LEVELS: Record<LevelId, Level> = {
  A1: {
    id: "A1",
    label: "A1 · Beginner",
    summary: "First words and phrases. Lots of help in your own language.",
    targetShare: 0.3,
    speed: 0.85,
    eagerness: "low",
    silenceSec: 12,
    policy:
      "The learner is a complete beginner. Speak mostly in SUPPORT, but say short, useful TARGET phrases and invite the learner to repeat or answer with them. Use only the most common words, one idea per sentence, present tense. Every time you use a new TARGET phrase, give its meaning in SUPPORT right after. Celebrate any attempt.",
  },
  A2: {
    id: "A2",
    label: "A2 · Elementary",
    summary: "Simple everyday exchanges. Frequent help.",
    targetShare: 0.55,
    speed: 0.9,
    eagerness: "low",
    silenceSec: 10,
    policy:
      "The learner is elementary. Speak in short, simple TARGET sentences about familiar, concrete topics. Switch to SUPPORT briefly to explain a word or rescue the learner, then return to TARGET. Offer two simple answer options when you ask a question.",
  },
  B1: {
    id: "B1",
    label: "B1 · Intermediate",
    summary: "Can hold a conversation. Help only when stuck.",
    targetShare: 0.8,
    speed: 0.95,
    eagerness: "medium",
    silenceSec: 9,
    policy:
      "The learner is intermediate. Speak in natural TARGET at a measured pace with everyday vocabulary. Use SUPPORT only when the learner is clearly stuck or asks, and keep it to one short sentence before returning to TARGET.",
  },
  B2: {
    id: "B2",
    label: "B2 · Upper intermediate",
    summary: "Comfortable conversation. Rare help.",
    targetShare: 0.92,
    speed: 1,
    eagerness: "medium",
    silenceSec: 8,
    policy:
      "The learner is upper intermediate. Speak natural TARGET at normal speed, including common idioms. Explain difficult words in simpler TARGET first; use SUPPORT only if the learner asks or is still stuck after that.",
  },
  C1: {
    id: "C1",
    label: "C1 · Advanced",
    summary: "Full immersion with nuance and idioms.",
    targetShare: 0.98,
    speed: 1.05,
    eagerness: "auto",
    silenceSec: 8,
    policy:
      "The learner is advanced. Stay in TARGET at native pace, with idioms, humor and register shifts. Paraphrase in TARGET instead of switching; use SUPPORT only on an explicit request.",
  },
  C2: {
    id: "C2",
    label: "C2 · Proficient",
    summary: "Native-like. Precision and style.",
    targetShare: 1,
    speed: 1.1,
    eagerness: "auto",
    silenceSec: 8,
    policy:
      "The learner is near-native. Speak exactly as you would to a native speaker. Never switch to SUPPORT unless explicitly asked. Point out subtle unnatural phrasing.",
  },
};

export function isLevel(v: unknown): v is LevelId {
  return typeof v === "string" && (LEVEL_IDS as readonly string[]).includes(v);
}

export function level(id: LevelId): Level {
  return LEVELS[id];
}
