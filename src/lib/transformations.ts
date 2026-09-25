import { nanoid } from "nanoid";
import { db } from "./db";
import type { Transformation } from "./types";

/**
 * Built-in transformations. They are read-only and live in code so they
 * improve with the app; user transformations are stored in the database.
 */
export const BUILTIN_TRANSFORMATIONS: Transformation[] = [
  {
    id: "builtin:dense-summary",
    name: "Dense summary",
    description: "Everything important, as compactly as possible.",
    prompt:
      "Write a dense summary of the source. Cover every key claim, figure, and conclusion, with no filler. Use short paragraphs.",
    builtin: true,
  },
  {
    id: "builtin:key-insights",
    name: "Key insights",
    description: "The five to ten ideas worth remembering.",
    prompt:
      "List the 5-10 most important insights in the source as a bulleted list. Each bullet is one bold short headline followed by one or two sentences of explanation.",
    builtin: true,
  },
  {
    id: "builtin:analyze-paper",
    name: "Analyze paper",
    description: "Question, method, findings, limitations.",
    prompt:
      "Analyze the source as a research paper or report. Use these headings: Research question, Method, Key findings, Limitations, Why it matters. If a heading does not apply, say so briefly.",
    builtin: true,
  },
  {
    id: "builtin:simple-summary",
    name: "Explain simply",
    description: "Plain language for a newcomer.",
    prompt:
      "Explain what the source says in plain language for someone new to the topic. Avoid jargon; define any term you must use. Three to five short paragraphs.",
    builtin: true,
  },
  {
    id: "builtin:toc",
    name: "Table of contents",
    description: "The structure of the source, section by section.",
    prompt:
      "Produce a table of contents for the source as a nested Markdown list, with a one-line description of each section.",
    builtin: true,
  },
  {
    id: "builtin:reflection",
    name: "Reflection questions",
    description: "Questions to think through after reading.",
    prompt:
      "Write 6-8 open-ended reflection questions that help a reader think critically about the source. Group them under short headings if natural.",
    builtin: true,
  },
  {
    id: "builtin:glossary",
    name: "Glossary",
    description: "Terms and their meanings, as the source uses them.",
    prompt:
      "Build a glossary of the specialised terms, acronyms, and named concepts in the source, alphabetically, as a Markdown list: **Term** — definition as used in the source.",
    builtin: true,
  },
  {
    id: "builtin:action-items",
    name: "Action items",
    description: "Concrete recommendations and next steps.",
    prompt:
      "Extract the concrete recommendations, decisions, and next steps stated or clearly implied in the source, as a checklist (`- [ ] ...`). If there are none, say so.",
    builtin: true,
  },
];

type Row = { id: string; name: string; description: string | null; prompt: string };

export function listTransformations(): Transformation[] {
  const custom = (
    db
      .prepare("SELECT id, name, description, prompt FROM transformations ORDER BY name")
      .all() as unknown as Row[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    prompt: r.prompt,
    builtin: false,
  }));
  return [...BUILTIN_TRANSFORMATIONS, ...custom];
}

export function getTransformation(id: string): Transformation | null {
  const b = BUILTIN_TRANSFORMATIONS.find((t) => t.id === id);
  if (b) return b;
  const r = db
    .prepare("SELECT id, name, description, prompt FROM transformations WHERE id = ?")
    .get(id) as unknown as Row | undefined;
  return r
    ? { id: r.id, name: r.name, description: r.description ?? "", prompt: r.prompt, builtin: false }
    : null;
}

function clean(input: { name?: string; description?: string; prompt?: string }) {
  return {
    name: input.name?.trim().slice(0, 80),
    description: input.description?.trim().slice(0, 300),
    prompt: input.prompt?.trim().slice(0, 8000),
  };
}

export function createTransformation(input: {
  name?: string;
  description?: string;
  prompt?: string;
}): Transformation {
  const c = clean(input);
  if (!c.name || !c.prompt) throw new TransformationInputError("Name and prompt are required.");
  const id = nanoid(12);
  const now = Date.now();
  db.prepare(
    `INSERT INTO transformations (id, name, description, prompt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, c.name, c.description ?? "", c.prompt, now, now);
  return getTransformation(id)!;
}

export function updateTransformation(
  id: string,
  input: { name?: string; description?: string; prompt?: string }
): Transformation | null {
  const t = getTransformation(id);
  if (!t) return null;
  if (t.builtin) throw new TransformationInputError("Built-in transformations cannot be edited.");
  const c = clean(input);
  db.prepare(
    "UPDATE transformations SET name = ?, description = ?, prompt = ?, updated_at = ? WHERE id = ?"
  ).run(
    c.name || t.name,
    c.description ?? t.description,
    c.prompt || t.prompt,
    Date.now(),
    id
  );
  return getTransformation(id);
}

export function deleteTransformation(id: string) {
  if (id.startsWith("builtin:")) {
    throw new TransformationInputError("Built-in transformations cannot be deleted.");
  }
  db.prepare("DELETE FROM transformations WHERE id = ?").run(id);
}

export class TransformationInputError extends Error {}
