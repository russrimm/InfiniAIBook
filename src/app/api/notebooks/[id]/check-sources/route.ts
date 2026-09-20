import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import {
  checkSource,
  diffSummary,
  RECHECK_AFTER_MS,
  type SourceRow,
} from "@/lib/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** Fetches run concurrently, but not so many that a host sees a burst. */
const CONCURRENCY = 4;

async function pool<T>(items: T[], n: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await worker(next);
    })
  );
}

/**
 * Re-checks the notebook's linked sources and reports what changed. Nothing is
 * applied here — a change to a source silently rewriting what the notebook
 * says is exactly what needs approval.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: notebookId } = await params;
    const { force } = ((await req.json().catch(() => ({}))) ?? {}) as {
      force?: boolean;
    };

    const cutoff = Date.now() - RECHECK_AFTER_MS;
    const rows = db
      .prepare(
        `SELECT id, notebook_id, title, kind, url, text, content_hash, checked_at, pending_hash
           FROM sources
          WHERE notebook_id = ? AND url IS NOT NULL AND url != ''`
      )
      .all(notebookId) as unknown as SourceRow[];

    // A source already awaiting a decision is not re-fetched: doing so would
    // move the goalposts under a prompt the user has not answered yet.
    const due = rows.filter(
      (r) =>
        !r.pending_hash && (force || r.checked_at === null || r.checked_at < cutoff)
    );

    let changed = 0;
    const errors: string[] = [];
    await pool(due, CONCURRENCY, async (row) => {
      const res = await checkSource(row);
      if (res.changed) changed++;
      if (res.error) errors.push(`${row.title}: ${res.error}`);
    });

    return ok({
      checked: due.length,
      skipped: rows.length - due.length,
      changed,
      errors,
      pending: pendingFor(notebookId),
    });
  } catch (e) {
    return fail(e);
  }
}

/** Everything currently awaiting a decision, with a summary of the change. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id: notebookId } = await params;
    return ok({ pending: pendingFor(notebookId) });
  } catch (e) {
    return fail(e);
  }
}

function pendingFor(notebookId: string) {
  const rows = db
    .prepare(
      `SELECT id, title, url, text, pending_text, pending_title, pending_at
         FROM sources
        WHERE notebook_id = ? AND pending_text IS NOT NULL
        ORDER BY pending_at DESC`
    )
    .all(notebookId) as unknown as {
    id: string;
    title: string;
    url: string;
    text: string;
    pending_text: string;
    pending_title: string | null;
    pending_at: number;
  }[];

  return rows.map((r) => {
    const diff = diffSummary(r.text, r.pending_text);
    return {
      id: r.id,
      title: r.title,
      newTitle: r.pending_title && r.pending_title !== r.title ? r.pending_title : null,
      url: r.url,
      detectedAt: r.pending_at,
      oldChars: r.text.length,
      newChars: r.pending_text.length,
      addedLines: diff.addedLines,
      removedLines: diff.removedLines,
      charDelta: diff.charDelta,
      samples: diff.samples,
    };
  });
}
