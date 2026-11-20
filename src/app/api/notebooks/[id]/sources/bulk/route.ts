import { NextResponse } from "next/server";
import { db, transaction } from "@/lib/db";
import { BadRequestError, readBody } from "@/lib/badrequest";
import { fail, ok } from "@/lib/http";
import { normalizeTag, normalizeTags, parseTags, serializeTags, withTag, withoutTag, MAX_TAGS } from "@/lib/tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Most sources one bulk request may touch. */
export const MAX_BULK = 500;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestError("Choose at least one source.");
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && ID.test(v)))];
  if (ids.length === 0) throw new BadRequestError("Choose at least one source.");
  if (ids.length > MAX_BULK) throw new BadRequestError(`Change at most ${MAX_BULK} sources at once.`);
  return ids;
}

const rowsFor = (notebookId: string, ids: string[]) =>
  db
    .prepare(`SELECT id, tags FROM sources WHERE notebook_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .all(notebookId, ...ids) as unknown as { id: string; tags: string | null }[];

/**
 * Tag or untag many sources at once.
 *
 * - `{ action: "addTag", ids, tag }` and `{ action: "removeTag", ids, tag }`
 * - `{ action: "restore", tags: { <id>: [...] } }` puts earlier tags back (the undo for the other two)
 *
 * Answers `{ updated, skipped, previous }`; `previous` holds each changed
 * source's tags from before, ready to send to `restore`. Only sources in this
 * notebook are touched. `skipped` counts sources that already had 8 tags and
 * could not take another.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: notebookId } = await params;
    const body = await readBody<{ action?: unknown; ids?: unknown; tag?: unknown; tags?: unknown }>(req);

    if (body.action === "restore") {
      const map = body.tags;
      if (!map || typeof map !== "object" || Array.isArray(map)) throw new BadRequestError("Send the earlier tags to restore.");
      const entries = Object.entries(map as Record<string, unknown>).filter(([id]) => ID.test(id)).slice(0, MAX_BULK);
      let updated = 0;
      transaction(() => {
        const stmt = db.prepare("UPDATE sources SET tags = ? WHERE id = ? AND notebook_id = ?");
        for (const [id, tags] of entries) updated += Number(stmt.run(serializeTags(normalizeTags(tags)), id, notebookId).changes);
      });
      return ok({ updated, skipped: 0, previous: {} });
    }

    if (body.action !== "addTag" && body.action !== "removeTag") {
      throw new BadRequestError('Use action "addTag", "removeTag" or "restore".');
    }
    const tag = normalizeTag(body.tag);
    if (!tag) throw new BadRequestError("Type a tag name first.");
    const rows = rowsFor(notebookId, idsOf(body.ids));
    if (rows.length === 0) return NextResponse.json({ error: "None of those sources are in this notebook.", code: "invalid" }, { status: 404 });

    const previous: Record<string, string[]> = {};
    let updated = 0;
    let skipped = 0;
    transaction(() => {
      const stmt = db.prepare("UPDATE sources SET tags = ? WHERE id = ?");
      for (const row of rows) {
        const before = parseTags(row.tags);
        const after = body.action === "addTag" ? withTag(before, tag) : withoutTag(before, tag);
        if (body.action === "addTag" && after === before && before.length >= MAX_TAGS) skipped++;
        if (after.length === before.length && after.every((t, i) => t === before[i])) continue;
        stmt.run(serializeTags(after), row.id);
        previous[row.id] = before;
        updated++;
      }
    });
    return ok({ updated, skipped, previous });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Delete many sources: `?ids=a,b,c`. The browser sends this after its undo
 * window, in chunks, so the list stays short.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id: notebookId } = await params;
    const ids = idsOf((new URL(req.url).searchParams.get("ids") ?? "").split(","));
    const result = db
      .prepare(`DELETE FROM sources WHERE notebook_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
      .run(notebookId, ...ids);
    return ok({ deleted: Number(result.changes) });
  } catch (e) {
    return fail(e);
  }
}
