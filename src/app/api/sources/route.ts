import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sources?exclude=<notebookId>
 * Every source in the library, grouped by nothing: the picker that reuses a
 * source in another notebook filters and groups on the client.
 */
export async function GET(req: Request) {
  try {
    const exclude = new URL(req.url).searchParams.get("exclude");
    const rows = db
      .prepare(
        `SELECT s.id, s.title, s.kind, s.url, s.chars, s.created_at,
                n.id AS notebook_id, n.title AS notebook_title, n.emoji AS notebook_emoji
           FROM sources s JOIN notebooks n ON n.id = s.notebook_id
          WHERE (? IS NULL OR s.notebook_id != ?)
          ORDER BY n.title, s.created_at`
      )
      .all(exclude, exclude) as unknown as {
      id: string;
      title: string;
      kind: string;
      url: string | null;
      chars: number;
      created_at: number;
      notebook_id: string;
      notebook_title: string;
      notebook_emoji: string;
    }[];
    return ok({
      sources: rows.map((r) => ({
        id: r.id,
        title: r.title,
        kind: r.kind,
        url: r.url,
        chars: r.chars,
        createdAt: r.created_at,
        notebookId: r.notebook_id,
        notebookTitle: r.notebook_title,
        notebookEmoji: r.notebook_emoji,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}
