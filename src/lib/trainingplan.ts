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
import type { InfographicContent, SourceProvenance, TrainingContent } from "./types";
import { fillCuePictures, trainingImagesEnabled } from "./trainingpictures";
import { artifactSourceIds, SourceBoundaryError } from "./artifactsources";
import { generationSourceError } from "./http";
import { buildContext, sampleCorpus } from "./retrieve";
import { GROUNDING_RULES } from "./studio";

type Loose = Record<string, unknown>;

export function trainingSourcePages(notebookId: string, sourceIds: string[]): string[] {
  const selected = new Set(sourceIds);
  const rows = db.prepare("SELECT id, url FROM sources WHERE notebook_id = ?").all(notebookId) as unknown as {
    id: string; url: string | null;
  }[];
  return rows.flatMap((s) => selected.has(s.id) && s.url ? [s.url] : []);
}

export function notebookInfographics(
  notebookId: string,
  sourceIds: string[],
  limit = 20
): { id: string; title: string; content: InfographicContent & SourceProvenance }[] {
  if (!sourceIds.length) return [];
  const allowed = new Set(sourceIds);
  const rows = db.prepare(
    "SELECT id, title, content FROM artifacts WHERE notebook_id = ? AND type = 'infographic' ORDER BY created_at DESC"
  ).all(notebookId) as unknown as { id: string; title: string; content: string }[];
  const items: ReturnType<typeof notebookInfographics> = [];
  for (const row of rows) {
    let content: InfographicContent & SourceProvenance;
    try {
      content = JSON.parse(row.content);
    } catch {
      console.warn(`[training] Skipping invalid infographic ${row.id}.`);
      continue;
    }
    const provenance = artifactSourceIds(content);
    if (!provenance.length || !provenance.every((id) => allowed.has(id))) continue;
    items.push({ id: row.id, title: String(row.title ?? "").slice(0, 120), content });
    if (items.length >= limit) break;
  }
  return items;
}

/**
 * Cues for every section, or only for `only` (0-based) with the others left
 * as they are. Throws when the model's reply has nothing usable.
 */
export async function planTrainingVisuals(
  notebookId: string,
  c: Pick<TrainingContent, "title" | "objectives" | "sections" | "composition" | "sourceIds" | "citations">,
  only?: number,
  /** Find pictures for the planned visuals until this time (ms since epoch). */
  opts: { pictureDeadline?: number } = {}
): Promise<TrainingCue[][]> {
  const composition = normalizeComposition(c.composition);
  const sourceIds = artifactSourceIds(c);
  if (generationSourceError(notebookId, sourceIds)) {
    throw new SourceBoundaryError("This video's source selection cannot be verified. Generate a new training script from the selected sources before planning visuals.");
  }
  const passages = sampleCorpus(notebookId, sourceIds, Number(process.env.STUDIO_CONTEXT_CHARS || 30000));
  if (!passages.length) throw new SourceBoundaryError("The selected sources have no usable excerpts.");
  const infographics = notebookInfographics(notebookId, sourceIds);
  const images = trainingImagesEnabled();
  const system = `${GROUNDING_RULES}\n\n${TRAINING_VISUALS_INSTRUCTION({ images, infographics, presenter: composition })}
The script guides timing and layout, not evidence. Every factual visual, number and quotation must be supported by SOURCE EXCERPTS, even if an edited script says otherwise.`;
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

SOURCE EXCERPTS
===============
${buildContext(passages)}

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
      sourcePages: trainingSourcePages(notebookId, sourceIds),
    });
    if (missing) console.info(`[training] ${missing} visual(s) left without a picture until render`);
  }
  return c.sections.map((s, i) => (only === undefined || only === i ? planned[i] : s.cues ?? []));
}
