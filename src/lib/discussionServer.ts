/**
 * Server helpers for live discussions: the opening context, the realtime
 * session and source search. Kept out of the route files so they can be tested.
 */
import { db } from "./db";
import { retrieve, sampleCorpus, type Passage } from "./retrieve";
import {
  DISCUSSION_TOOLS,
  MODES,
  composeInstructions,
  numberExcerpts,
  renderExcerpts,
  type DiscussionCitation,
  type DiscussionSetup,
  type Excerpt,
} from "./discussion";
import type { RealtimeTarget } from "./realtime";

/**
 * Characters of source text placed in the session instructions. Enough for a
 * broad overview; anything more specific is fetched with search_sources.
 */
export const OVERVIEW_CHARS = Number(process.env.DISCUSSION_CONTEXT_CHARS) || 16_000;
const FOCUS_SHARE = 0.4;
const SEARCH_RESULTS = 5;
const EXCERPT_MAX = 1_500;

const toExcerpt = (p: Passage): Excerpt => ({
  passageId: p.id,
  sourceId: p.sourceId,
  sourceTitle: p.sourceTitle,
  idx: p.idx,
  text: p.text.length > EXCERPT_MAX ? p.text.slice(0, EXCERPT_MAX) + "…" : p.text,
});

export function notebookTitle(notebookId: string): string | null {
  const row = db.prepare("SELECT title FROM notebooks WHERE id = ?").get(notebookId) as
    | { title: string }
    | undefined;
  return row?.title ?? null;
}

export function sourceTitles(notebookId: string, sourceIds?: string[]): string[] {
  const rows = db
    .prepare("SELECT id, title FROM sources WHERE notebook_id = ? ORDER BY created_at")
    .all(notebookId) as unknown as { id: string; title: string }[];
  const keep = sourceIds ? new Set(sourceIds) : null;
  return rows.filter((r) => !keep || keep.has(r.id)).map((r) => r.title);
}

/**
 * The excerpts the AI starts with: passages on the focus first, when there is
 * one, then an even sample across every selected source.
 */
export async function openingExcerpts(
  notebookId: string,
  sourceIds: string[] | undefined,
  focus: string | undefined,
  budget = OVERVIEW_CHARS
): Promise<Excerpt[]> {
  const out: Excerpt[] = [];
  const seen = new Set<string>();
  let used = 0;
  const add = (p: Passage, limit: number) => {
    if (seen.has(p.id)) return;
    const e = toExcerpt(p);
    if (used + e.text.length > limit) return;
    seen.add(p.id);
    used += e.text.length;
    out.push(e);
  };
  if (focus) {
    for (const p of await retrieve(notebookId, focus, sourceIds, 8)) add(p, budget * FOCUS_SHARE);
  }
  for (const p of sampleCorpus(notebookId, sourceIds, budget)) add(p, budget);
  return out;
}

/** The realtime session for a discussion (model and type are set by the caller). */
export function buildDiscussionSession(opts: {
  setup: DiscussionSetup;
  title: string;
  sources: string[];
  excerpts: Excerpt[];
  target: RealtimeTarget;
}): { session: Record<string, unknown>; citations: DiscussionCitation[] } {
  const citations = numberExcerpts(opts.excerpts);
  const instructions = composeInstructions({
    setup: opts.setup,
    notebookTitle: opts.title,
    sourceTitles: opts.sources,
    overview: renderExcerpts(opts.excerpts, citations),
  });
  const vocabulary = `A conversation about "${opts.title}": ${opts.sources.join("; ")}`.slice(0, 500);
  const session = {
    instructions,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        ...(opts.target.transcription
          ? { transcription: { model: opts.target.transcription, prompt: vocabulary } }
          : {}),
        turn_detection: {
          type: "semantic_vad",
          // Answering a question takes thought; don't jump in on a pause.
          eagerness: MODES[opts.setup.mode].asksQuestions ? "low" : "medium",
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: opts.setup.voice },
    },
    tools: DISCUSSION_TOOLS,
    tool_choice: "auto",
  };
  return { session, citations };
}

export type KnownExcerpt = { passageId: string; n: number };

/**
 * Search for the AI mid-call. Passages it already has keep their numbers; new
 * ones are numbered from `start`. Returns the tool output and the new citations.
 */
export async function searchForDiscussion(opts: {
  notebookId: string;
  sourceIds?: string[];
  query: string;
  start: number;
  known: KnownExcerpt[];
}): Promise<{ output: string; citations: DiscussionCitation[] }> {
  const hits = await retrieve(opts.notebookId, opts.query, opts.sourceIds, SEARCH_RESULTS + 3);
  const known = new Map(opts.known.map((k) => [k.passageId, k.n]));
  const fresh: Excerpt[] = [];
  const already: number[] = [];
  for (const p of hits) {
    if (fresh.length + already.length >= SEARCH_RESULTS) break;
    const n = known.get(p.id);
    if (n) already.push(n);
    else fresh.push(toExcerpt(p));
  }
  const citations = numberExcerpts(fresh, opts.start);
  const parts: string[] = [];
  if (fresh.length) parts.push(renderExcerpts(fresh, citations));
  if (already.length) {
    parts.push(`Also relevant, excerpts you already have: ${already.map((n) => `[${n}]`).join(" ")}.`);
  }
  return {
    output: parts.length ? parts.join("\n\n") : "No passages in the sources match that. Say the sources don't cover it.",
    citations,
  };
}

/** Full passage text for cited excerpts, for writing the saved summary. */
export function passageTexts(ids: string[]): Map<string, string> {
  if (!ids.length) return new Map();
  const rows = db
    .prepare(`SELECT id, text FROM chunks WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as unknown as { id: string; text: string }[];
  return new Map(rows.map((r) => [r.id, r.text]));
}
