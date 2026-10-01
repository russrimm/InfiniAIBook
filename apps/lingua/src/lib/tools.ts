/**
 * Function tools the conversation partner calls while talking. They are how
 * the UI learns, in real time and without parsing speech, that the partner
 * switched language, corrected a mistake, taught a word or saw a goal met.
 */

export const CORRECTION_CATEGORIES = [
  "grammar",
  "vocabulary",
  "conjugation",
  "agreement",
  "word_order",
  "pronunciation",
  "register",
  "other",
] as const;
export type CorrectionCategory = (typeof CORRECTION_CATEGORIES)[number];

export const LANGUAGE_MODES = ["target", "support", "mixed"] as const;
export type LanguageMode = (typeof LANGUAGE_MODES)[number];

export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    name: "set_language_mode",
    description:
      "Call right before the language you mainly speak changes: 'target' (the language being learned), 'support' (the learner's own language) or 'mixed'. Silent; keep talking in the same turn.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: [...LANGUAGE_MODES] },
        reason: {
          type: "string",
          description: "Why, in a few English words, e.g. 'learner asked', 'learner seemed stuck', 'back to practice'.",
        },
      },
      required: ["mode", "reason"],
    },
  },
  {
    type: "function",
    name: "log_correction",
    description:
      "Record one mistake the learner just made in the target language, with the corrected version. Silent; keep talking in the same turn.",
    parameters: {
      type: "object",
      properties: {
        learner_said: { type: "string", description: "The learner's words containing the mistake." },
        corrected: { type: "string", description: "The natural, correct way to say it." },
        explanation: {
          type: "string",
          description: "One short sentence in the learner's own language explaining the fix.",
        },
        category: { type: "string", enum: [...CORRECTION_CATEGORIES] },
      },
      required: ["learner_said", "corrected", "explanation", "category"],
    },
  },
  {
    type: "function",
    name: "log_vocabulary",
    description:
      "Record a target-language word or phrase you introduced that the learner probably did not know. Silent; keep talking in the same turn.",
    parameters: {
      type: "object",
      properties: {
        term: { type: "string" },
        translation: { type: "string", description: "Meaning in the learner's own language." },
        example: { type: "string", description: "A short example sentence in the target language." },
      },
      required: ["term", "translation"],
    },
  },
  {
    type: "function",
    name: "scenario_progress",
    description: "Record that the learner achieved one of the conversation goals. Silent; keep talking.",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string" },
      },
      required: ["goal_id"],
    },
  },
];

export type ToolCall =
  | { name: "set_language_mode"; args: { mode: LanguageMode; reason: string } }
  | {
      name: "log_correction";
      args: { learner_said: string; corrected: string; explanation: string; category: CorrectionCategory };
    }
  | { name: "log_vocabulary"; args: { term: string; translation: string; example?: string } }
  | { name: "scenario_progress"; args: { goal_id: string } };

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validate a tool call's raw JSON arguments. Returns null for anything
 * malformed: a garbled call should never break the conversation.
 */
export function parseToolCall(name: string, rawArgs: string): ToolCall | null {
  let args: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawArgs || "{}");
    if (!parsed || typeof parsed !== "object") return null;
    args = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (name) {
    case "set_language_mode": {
      const mode = str(args.mode) as LanguageMode;
      if (!LANGUAGE_MODES.includes(mode)) return null;
      return { name, args: { mode, reason: str(args.reason, 120) } };
    }
    case "log_correction": {
      const learner_said = str(args.learner_said);
      const corrected = str(args.corrected);
      if (!learner_said || !corrected || learner_said === corrected) return null;
      const category = (CORRECTION_CATEGORIES as readonly string[]).includes(str(args.category))
        ? (str(args.category) as CorrectionCategory)
        : "other";
      return { name, args: { learner_said, corrected, explanation: str(args.explanation), category } };
    }
    case "log_vocabulary": {
      const term = str(args.term, 120);
      const translation = str(args.translation, 200);
      if (!term || !translation) return null;
      return { name, args: { term, translation, example: str(args.example) || undefined } };
    }
    case "scenario_progress": {
      const goal_id = str(args.goal_id, 40);
      return goal_id ? { name, args: { goal_id } } : null;
    }
    default:
      return null;
  }
}
