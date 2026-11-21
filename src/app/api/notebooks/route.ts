import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Activity is the newest source, message, generated item or note. The latest
    // row of each is found through its notebook index (rowid grows with every
    // insert), so a notebook with large artifacts is never scanned end to end.
    const rows = db
      .prepare(
        `SELECT n.id, n.title, n.emoji, n.created_at,
                (SELECT COUNT(*) FROM sources s WHERE s.notebook_id = n.id) AS source_count,
                MAX(
                  n.created_at,
                  COALESCE((SELECT created_at FROM sources WHERE notebook_id = n.id ORDER BY rowid DESC LIMIT 1), 0),
                  COALESCE((SELECT created_at FROM messages WHERE notebook_id = n.id ORDER BY rowid DESC LIMIT 1), 0),
                  COALESCE((SELECT created_at FROM artifacts WHERE notebook_id = n.id ORDER BY rowid DESC LIMIT 1), 0),
                  COALESCE((SELECT MAX(updated_at) FROM notes WHERE notebook_id = n.id), 0)
                ) AS last_activity
         FROM notebooks n ORDER BY n.created_at DESC`
      )
      .all() as unknown as {
      id: string;
      title: string;
      emoji: string;
      created_at: number;
      source_count: number;
      last_activity: number;
    }[];
    return ok(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        emoji: r.emoji,
        createdAt: r.created_at,
        sourceCount: r.source_count,
        lastActivity: r.last_activity,
      }))
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const id = nanoid(12);
    const emojis = ["📓", "🔬", "🗂️", "🧪", "📚", "🧭", "🛰️", "🧩"];
    db.prepare(
      "INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?, ?, ?, ?)"
    ).run(
      id,
      body.title?.trim() || "Untitled notebook",
      emojis[Math.floor(Math.random() * emojis.length)],
      Date.now()
    );
    return ok({ id }, 201);
  } catch (e) {
    return fail(e);
  }
}
