import { db } from "./db";
import {
  EMPTY_NARRATION,
  normalizeInstructions,
  normalizeReplacements,
  type NarrationSettings,
} from "./narration";

type NarrationRow = {
  narration_instructions: string | null;
  narration_replacements: string | null;
};

/** The notebook's saved narration defaults. */
export function notebookNarration(notebookId: string): NarrationSettings {
  const row = db
    .prepare(
      "SELECT narration_instructions, narration_replacements FROM notebooks WHERE id = ?"
    )
    .get(notebookId) as unknown as NarrationRow | undefined;
  if (!row) return { ...EMPTY_NARRATION };
  return {
    instructions: normalizeInstructions(row.narration_instructions ?? ""),
    replacements: normalizeReplacements(row.narration_replacements ?? "[]"),
  };
}

export function saveNotebookNarration(notebookId: string, s: NarrationSettings): void {
  db.prepare(
    "UPDATE notebooks SET narration_instructions = ?, narration_replacements = ? WHERE id = ?"
  ).run(s.instructions, JSON.stringify(s.replacements), notebookId);
}
