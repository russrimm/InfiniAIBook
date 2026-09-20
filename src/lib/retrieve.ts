import { db, blobToFloats } from "./db";
import { embed, embedModel } from "./ai";

export type Passage = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  idx: number;
  text: string;
  score?: number;
};

type ChunkRow = {
  id: string;
  source_id: string;
  idx: number;
  text: string;
  embedding: Uint8Array | null;
  embed_model: string | null;
  embed_dims: number | null;
  title: string;
};

function rows(notebookId: string, sourceIds?: string[]): ChunkRow[] {
  let sql = `SELECT c.id, c.source_id, c.idx, c.text, c.embedding,
                    c.embed_model, c.embed_dims, s.title
             FROM chunks c JOIN sources s ON s.id = c.source_id
             WHERE c.notebook_id = ?`;
  const params: string[] = [notebookId];
  if (sourceIds && sourceIds.length) {
    sql += ` AND c.source_id IN (${sourceIds.map(() => "?").join(",")})`;
    params.push(...sourceIds);
  }
  sql += " ORDER BY s.created_at, c.idx";
  return db.prepare(sql).all(...params) as unknown as ChunkRow[];
}

/**
 * Cosine similarity over two vectors of equal length.
 *
 * Callers must check dimensions first. Comparing vectors of different sizes is
 * meaningless — embeddings from different models occupy unrelated spaces — but
 * doing so silently returns a plausible number rather than an error, which
 * degrades retrieval to noise with nothing to indicate why.
 */
function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function keywordScore(text: string, query: string): number {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  if (!terms.length) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const t of terms) if (lower.includes(t)) hits++;
  return hits / terms.length;
}

/**
 * Chunks whose embedding cannot be compared with the current model's output,
 * because they were produced by a different model. Reported rather than
 * silently skipped so the cause of weaker results is visible.
 */
export type EmbeddingMismatch = {
  staleChunks: number;
  totalChunks: number;
  models: string[];
  currentModel: string;
};

let lastMismatch: EmbeddingMismatch | null = null;

/** Mismatch seen during the most recent retrieve(), if any. */
export function lastEmbeddingMismatch(): EmbeddingMismatch | null {
  return lastMismatch;
}

export async function retrieve(
  notebookId: string,
  query: string,
  sourceIds: string[] | undefined,
  k = 12
): Promise<Passage[]> {
  const all = rows(notebookId, sourceIds);
  if (!all.length) return [];

  let qv: Float32Array | null = null;
  try {
    qv = new Float32Array((await embed([query]))[0]);
  } catch {
    qv = null; // fall back to keyword-only ranking
  }

  const stale = new Set<string>();
  let staleCount = 0;

  const scored = all.map((r) => {
    const ev = blobToFloats(r.embedding);
    // cosine() returns 0 for unequal lengths; count those so the degradation
    // can be surfaced instead of quietly halving result quality.
    let sem = 0;
    if (qv && ev.length) {
      if (ev.length === qv.length) {
        sem = cosine(qv, ev);
      } else {
        staleCount++;
        stale.add(r.embed_model ?? `${ev.length}-dim`);
      }
    }
    const kw = keywordScore(r.text, query);
    return {
      id: r.id,
      sourceId: r.source_id,
      sourceTitle: r.title,
      idx: r.idx,
      text: r.text,
      score: sem * 0.85 + kw * 0.15,
    } satisfies Passage;
  });

  lastMismatch = staleCount
    ? {
        staleChunks: staleCount,
        totalChunks: all.length,
        models: [...stale],
        currentModel: embedModel(),
      }
    : null;

  if (lastMismatch) {
    console.warn(
      `[retrieve] ${staleCount}/${all.length} chunks were embedded with ` +
        `${[...stale].join(", ")} but the current model is ${embedModel()}. ` +
        `Those chunks are ranked by keyword only. Re-embed to restore semantic search.`
    );
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return scored.slice(0, k);
}

/** Broad, evenly-spread sample of the corpus for whole-notebook generation. */
export function sampleCorpus(
  notebookId: string,
  sourceIds: string[] | undefined,
  maxChars = 60000
): Passage[] {
  const all = rows(notebookId, sourceIds);
  if (!all.length) return [];

  const bySource = new Map<string, ChunkRow[]>();
  for (const r of all) {
    if (!bySource.has(r.source_id)) bySource.set(r.source_id, []);
    bySource.get(r.source_id)!.push(r);
  }

  const budgetPer = Math.floor(maxChars / bySource.size);
  const picked: ChunkRow[] = [];
  for (const list of bySource.values()) {
    let used = 0;
    const total = list.reduce((s, r) => s + r.text.length, 0);
    if (total <= budgetPer) {
      picked.push(...list);
      continue;
    }
    const step = Math.max(1, Math.ceil(total / budgetPer));
    for (let i = 0; i < list.length; i += step) {
      if (used + list[i].text.length > budgetPer) break;
      picked.push(list[i]);
      used += list[i].text.length;
    }
    if (!picked.length) picked.push(list[0]);
  }

  return picked.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceTitle: r.title,
    idx: r.idx,
    text: r.text,
  }));
}

/** Render passages as a numbered context block the model can cite as [1], [2]... */
export function buildContext(passages: Passage[]): string {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] (source: "${p.sourceTitle}", part ${p.idx + 1})\n${p.text}`
    )
    .join("\n\n---\n\n");
}

export function citationList(passages: Passage[]) {
  return passages.map((p, i) => ({
    n: i + 1,
    sourceId: p.sourceId,
    sourceTitle: p.sourceTitle,
    part: p.idx + 1,
    snippet: p.text.slice(0, 320),
  }));
}
