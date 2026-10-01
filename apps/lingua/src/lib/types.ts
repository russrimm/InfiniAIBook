/** Shapes shared by the API, the database and the UI. */
import { z } from "zod";
import { CORRECTION_CATEGORIES } from "./tools";

export const TurnSchema = z.object({
  role: z.enum(["learner", "partner"]),
  text: z.string().max(4000),
  /** Detected language code, when known. */
  lang: z.string().max(8).nullable().default(null),
  /** Translation into the learner's own language, for partner turns. */
  gloss: z.string().max(4000).optional(),
  /** Milliseconds since the call connected. */
  at: z.number().int().min(0).max(24 * 3600 * 1000),
  interrupted: z.boolean().optional(),
});
export type Turn = z.infer<typeof TurnSchema>;

export const CorrectionSchema = z.object({
  /** Index into the transcript of the learner turn this refers to. */
  turnIndex: z.number().int().min(0).nullable(),
  learnerSaid: z.string().max(400),
  corrected: z.string().max(400),
  explanation: z.string().max(400),
  category: z.enum(CORRECTION_CATEGORIES),
});
export type Correction = z.infer<typeof CorrectionSchema>;

export const VocabSchema = z.object({
  term: z.string().max(120),
  translation: z.string().max(200),
  example: z.string().max(400).optional(),
});
export type Vocab = z.infer<typeof VocabSchema>;

export const TranscriptSchema = z.object({
  turns: z.array(TurnSchema).max(2000),
  corrections: z.array(CorrectionSchema).max(1000),
  vocabulary: z.array(VocabSchema).max(1000),
  goalsDone: z.array(z.string().max(40)).max(50),
  durationSec: z.number().int().min(0).max(24 * 3600),
  ended: z.boolean().default(false),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

export const RecapSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).max(6),
  mistakes: z
    .array(
      z.object({
        said: z.string(),
        better: z.string(),
        why: z.string(),
      })
    )
    .max(10),
  vocabulary: z
    .array(
      z.object({
        term: z.string(),
        meaning: z.string(),
        example: z.string().optional(),
      })
    )
    .max(20),
  nextSteps: z.array(z.string()).max(5),
  suggestedScenario: z.string().optional(),
  estimatedLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional(),
  /** Share of the learner's speech that was in the target language, 0–100. */
  targetLanguageShare: z.number().min(0).max(100).optional(),
});
export type Recap = z.infer<typeof RecapSchema>;

export type SessionSummary = {
  id: string;
  createdAt: number;
  endedAt: number | null;
  target: string;
  support: string;
  level: string;
  scenario: string;
  persona: string;
  durationSec: number;
  turnCount: number;
  hasRecap: boolean;
};

export type SessionDetail = SessionSummary & {
  learnerName: string | null;
  transcript: Transcript;
  recap: Recap | null;
};
