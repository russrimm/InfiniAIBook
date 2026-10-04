/**
 * Ask the studio model to place visuals on a training transcript.
 *
 * Planned separately from the transcript so it can run again after the user
 * edits the script, for the whole video or a single section.
 */
import { db } from "./db";
import { studioJSON, type ChatMsg } from "./ai";
import {
  TRAINING_VISUALS_INSTRUCTION,
  compositionPalette,
  normalizeComposition,
  normalizeVisualPlan,
  type TrainingCue,
} from "./trainingvisuals";
import type { TrainingContent } from "./types";
import { fillCuePictures, trainingImagesEnabled } from "./trainingpictures";

type Loose = Record<string, unknown>;

export function notebookInfographics(notebookId: string): { id: string; title: string }[] {
  return (
    db
      .prepare(
        "SELECT id, title FROM artifacts WHERE notebook_id = ? AND type = 'infographic' ORDER BY created_at DESC LIMIT 20"
      )
      .all(notebookId) as unknown as { id: string; title: string }[]
  ).map((r) => ({ id: r.id, title: String(r.title ?? "").slice(0, 120) }));
}

/**
 * Cues for every section, or only for `only` (0-based) with the others left
 * as they are. Throws when the model's reply has nothing usable.
 */
export async function planTrainingVisuals(
  notebookId: string,
  c: Pick<TrainingContent, "title" | "objectives" | "sections" | "composition">,
  only?: number,
  /** Find pictures for the planned visuals until this time (ms since epoch). */
  opts: { pictureDeadline?: number } = {}
): Promise<TrainingCue[][]> {
  const composition = normalizeComposition(c.composition);
  const infographics = notebookInfographics(notebookId);
  const images = trainingImagesEnabled();
  const system = TRAINING_VISUALS_INSTRUCTION({ images, infographics });
  const sections = c.sections
    .map((s, i) =>
      only === undefined || only === i
        ? `SECTION ${i + 1}: ${s.title || "Untitled"}\n${s.text}`
        : null
    )
    .filter(Boolean)
    .join("\n\n");
  const user = `TRAINING: ${c.title}
LEARNING OBJECTIVES:
${(c.objectives ?? []).map((o) => `- ${o}`).join("\n") || "- (none listed)"}

SCRIPT
======
${sections}`;

  let plan: TrainingCue[][] | null = null;
  for (let attempt = 0; attempt < 2 && !plan; attempt++) {
    const raw = await studioJSON<Loose>(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ] satisfies ChatMsg[],
      0.4
    );
    const out = normalizeVisualPlan(raw, c.sections, {
      composition,
      images,
      infographicIds: infographics.map((g) => g.id),
    });
    const relevant = only === undefined ? out : [out[only] ?? []];
    if (relevant.some((cues) => cues.length)) plan = out;
  }
  if (!plan) throw Object.assign(new Error("The model did not return any usable visuals. Try again."), { status: 502 });
  const planned = plan;
  if (opts.pictureDeadline && opts.pictureDeadline > Date.now()) {
    // Pictures for the new visuals only; the other sections keep theirs.
    const fresh = c.sections.map((s, i) => ({ ...s, cues: only === undefined || only === i ? planned[i] : [] }));
    const { missing } = await fillCuePictures(fresh, compositionPalette(composition), {
      ai: images,
      deadline: opts.pictureDeadline,
    });
    if (missing) console.info(`[training] ${missing} visual(s) left without a picture until render`);
  }
  return c.sections.map((s, i) => (only === undefined || only === i ? planned[i] : s.cues ?? []));
}
