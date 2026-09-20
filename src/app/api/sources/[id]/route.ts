import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const row = db
      .prepare("SELECT id, title, kind, url, text, chars, summary FROM sources WHERE id = ?")
      .get(id) as unknown as
      | {
          id: string;
          title: string;
          kind: string;
          url: string | null;
          text: string;
          chars: number;
          summary: string | null;
        }
      | undefined;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    db.prepare("DELETE FROM sources WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

/** Accept or discard a detected change to a linked source. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { action } = (await req.json()) as { action?: "apply" | "dismiss" };

    const row = db
      .prepare(
        "SELECT id, title, pending_text, pending_title, pending_hash FROM sources WHERE id = ?"
      )
      .get(id) as unknown as
      | {
          id: string;
          title: string;
          pending_text: string | null;
          pending_title: string | null;
          pending_hash: string | null;
        }
      | undefined;

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!row.pending_text) {
      return NextResponse.json(
        { error: "This source has no pending change." },
        { status: 409 }
      );
    }

    if (action === "dismiss") {
      // Keep the new hash as the baseline, or the same change is re-detected
      // on the next check and asked about again.
      db.prepare(
        `UPDATE sources
            SET content_hash = COALESCE(pending_hash, content_hash),
                pending_text = NULL, pending_hash = NULL,
                pending_title = NULL, pending_at = NULL
          WHERE id = ?`
      ).run(id);
      return ok({ id, applied: false });
    }

    if (action !== "apply") {
      return NextResponse.json(
        { error: 'action must be "apply" or "dismiss".' },
        { status: 400 }
      );
    }

    const { reindexSource } = await import("@/lib/refresh");
    const { chunks, warning } = await reindexSource(
      id,
      row.pending_text,
      row.pending_title || row.title
    );
    return ok({ id, applied: true, chunks, warning });
  } catch (e) {
    return fail(e);
  }
}
