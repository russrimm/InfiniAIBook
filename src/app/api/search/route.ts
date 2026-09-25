import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { searchPassages } from "@/lib/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=...&mode=text|vector&notebookId=...
 * Searches source passages and notes across all notebooks.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 500);
    const mode = url.searchParams.get("mode") === "vector" ? "vector" : "text";
    const notebookId = url.searchParams.get("notebookId") || undefined;
    if (!q) return ok({ query: q, mode, semantic: false, hits: [], notes: [] });

    const { hits, semantic } = await searchPassages(q, { mode, notebookId, k: 30 });

    const like = `%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    let sql = `SELECT t.id, t.notebook_id, t.title, t.content, t.kind, t.updated_at,
                      n.title AS notebook_title
                 FROM notes t JOIN notebooks n ON n.id = t.notebook_id
                WHERE (t.title LIKE ? ESCAPE '\\' OR t.content LIKE ? ESCAPE '\\')`;
    const params: string[] = [like, like];
    if (notebookId) {
      sql += " AND t.notebook_id = ?";
      params.push(notebookId);
    }
    sql += " ORDER BY t.updated_at DESC LIMIT 20";
    const notes = (
      db.prepare(sql).all(...params) as unknown as {
        id: string;
        notebook_id: string;
        title: string;
        content: string;
        kind: string;
        updated_at: number;
        notebook_title: string;
      }[]
    ).map((n) => {
      const at = n.content.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, at - 80);
      return {
        id: n.id,
        notebookId: n.notebook_id,
        notebookTitle: n.notebook_title,
        title: n.title,
        kind: n.kind,
        snippet: (start ? "…" : "") + n.content.slice(start, start + 280),
        updatedAt: n.updated_at,
      };
    });

    return ok({
      query: q,
      mode,
      semantic,
      hits: hits.map((h) => ({
        id: h.id,
        notebookId: h.notebookId,
        notebookTitle: h.notebookTitle,
        sourceId: h.sourceId,
        sourceTitle: h.sourceTitle,
        part: h.idx + 1,
        snippet: h.text.slice(0, 400),
        score: Number((h.score ?? 0).toFixed(3)),
      })),
      notes,
    });
  } catch (e) {
    return fail(e);
  }
}
