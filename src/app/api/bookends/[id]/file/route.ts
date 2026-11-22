import { NextResponse } from "next/server";
import fs from "node:fs";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { MAX_BOOKEND_UPLOAD_BYTES } from "@/lib/bookends";
import { BODY_OVERHEAD_BYTES, readLimitedForm } from "@/lib/bodylimits";
import { storeBookendFile } from "@/lib/bookendbuild";
import { hostIsRendering, loadHost, slotOf, updateSlot } from "@/lib/bookendroute";
import { clipPath } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Use an existing video as a slot's clip, copying it into this video so deleting
 * the original never breaks it. Either an upload (multipart: `slot`, `file`, an
 * MP4 up to 100 MB) or a library clip (JSON: `{ slot, artifactId, index }`).
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const host = loadHost(id);
    if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (hostIsRendering(host)) {
      return NextResponse.json({ error: "The video is rendering. Wait for it to finish before changing the intro or outro." }, { status: 409 });
    }
    const type = req.headers.get("content-type") ?? "";

    let slot: ReturnType<typeof slotOf>;
    let stored: { clipId: string; seconds: number };
    let mode: "upload" | "library";
    let label: string;

    if (type.includes("multipart/form-data")) {
      const form = await readLimitedForm(
        req,
        MAX_BOOKEND_UPLOAD_BYTES + BODY_OVERHEAD_BYTES,
        "That video is larger than 100 MB. Trim it or export it at a lower quality.",
      );
      slot = slotOf(form.get("slot"));
      const file = form.get("file");
      if (!slot || !(file instanceof File)) return NextResponse.json({ error: "Send a slot and an MP4 file.", code: "invalid" }, { status: 400 });
      if (file.size > MAX_BOOKEND_UPLOAD_BYTES) return NextResponse.json({ error: "That video is larger than 100 MB.", code: "too_large" }, { status: 413 });
      stored = storeBookendFile(id, { bytes: new Uint8Array(await file.arrayBuffer()) });
      mode = "upload";
      label = file.name.replace(/[^\w .-]/g, "").slice(0, 60) || "Uploaded video";
    } else {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      slot = slotOf(body?.slot);
      const artifactId = typeof body?.artifactId === "string" ? body.artifactId : "";
      const index = Number(body?.index);
      if (!body || !slot || !artifactId) return NextResponse.json({ error: "Send a slot and a library clip.", code: "invalid" }, { status: 400 });
      const row = db.prepare("SELECT title, notebook_id FROM artifacts WHERE id = ? AND type = 'clip'").get(artifactId) as unknown as
        | { title: string; notebook_id: string }
        | undefined;
      if (!row || row.notebook_id !== host.notebookId) return NextResponse.json({ error: "That clip is not in this notebook." }, { status: 404 });
      let file: string;
      try {
        file = clipPath(artifactId, index, "mp4");
      } catch {
        return NextResponse.json({ error: "That clip was not found." }, { status: 404 });
      }
      if (!fs.existsSync(file)) return NextResponse.json({ error: "That clip's file is no longer there." }, { status: 404 });
      stored = storeBookendFile(id, { file });
      mode = "library";
      label = row.title.slice(0, 60);
    }

    const bookends = updateSlot(id, slot!, (s) => ({
      ...s,
      mode,
      clipId: stored.clipId,
      clipSeconds: stored.seconds,
      clipKey: undefined,
      label,
    }));
    return ok({ bookends });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 400) return NextResponse.json({ error: (e as Error).message, code: "invalid" }, { status });
    return fail(e);
  }
}
