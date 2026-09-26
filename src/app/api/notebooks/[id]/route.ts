import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import { removeAudio, removeImage, removeVideo } from "@/lib/paths";
import { reconcileStalledVideos } from "@/lib/videobuild";
import { forgetTraining, resumeStalledTrainings } from "@/lib/trainingbuild";
import { listSessions, sessionMessages } from "@/lib/sessions";
import { listNotes } from "@/lib/notes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type NbRow = { id: string; title: string; emoji: string; created_at: number };
type SrcRow = {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  chars: number;
  summary: string | null;
  created_at: number;
};
/**
 * Listing shape: no body. Artifact bodies are the bulk of this response and
 * grow with every artifact ever generated, while the list only renders a
 * title and a date. Whatever opens one fetches it from /api/artifacts/[id].
 */
type ArtRow = {
  id: string;
  type: string;
  title: string;
  created_at: number;
};

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const nb = db
      .prepare("SELECT id, title, emoji, created_at FROM notebooks WHERE id = ?")
      .get(id) as unknown as NbRow | undefined;
    if (!nb) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // This is the endpoint the video player polls, so it is where a build that
    // died with its process gets noticed and reported instead of appearing to
    // run forever.
    reconcileStalledVideos(id);
    resumeStalledTrainings(id);

    const sourceRows = db
      .prepare(
        `SELECT id, title, kind, url, chars, summary, created_at
         FROM sources WHERE notebook_id = ? ORDER BY created_at`
      )
      .all(id) as unknown as SrcRow[];

    const artifactRows = db
      .prepare(
        `SELECT id, type, title, created_at FROM artifacts
         WHERE notebook_id = ? ORDER BY created_at DESC`
      )
      .all(id) as unknown as ArtRow[];

    // Chat is split into sessions; `messages` is the most recent one, kept so
    // older clients that only read it still show a conversation.
    const sessions = listSessions(id);
    const messages = sessions.length ? sessionMessages(sessions[0].id) : [];

    return ok({
      notebook: {
        id: nb.id,
        title: nb.title,
        emoji: nb.emoji,
        createdAt: nb.created_at,
      },
      sources: sourceRows.map((s) => ({
        id: s.id,
        title: s.title,
        kind: s.kind,
        url: s.url,
        chars: s.chars,
        summary: s.summary,
        createdAt: s.created_at,
      })),
      artifacts: artifactRows.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        createdAt: a.created_at,
      })),
      messages,
      sessions,
      notes: listNotes(id),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { title?: string };
    if (body.title?.trim()) {
      db.prepare("UPDATE notebooks SET title = ? WHERE id = ?").run(
        body.title.trim(),
        id
      );
    }
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    // Artifact rows cascade, but the files they point at do not. Every type
    // that writes to disk has to be cleaned here or it is orphaned for good.
    const artifacts = db
      .prepare("SELECT id, type, content FROM artifacts WHERE notebook_id = ?")
      .all(id) as unknown as { id: string; type: string; content: string }[];

    for (const a of artifacts) {
      if (a.type === "podcast") removeAudio(a.id);
      else if (a.type === "infographic") removeImage(a.id);
      else if (a.type === "video") removeVideo(a.id);
      else if (a.type === "training") {
        removeVideo(a.id);
        forgetTraining(a.content);
      }
    }

    db.prepare("DELETE FROM notebooks WHERE id = ?").run(id);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
