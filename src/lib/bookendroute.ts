/** Small helpers shared by the /api/bookends/:id/* routes. */
import { db } from "./db";
import { isRendering } from "./trainingbuild";
import { BOOKEND_SLOTS, normalizeBookends, type BookendSetting, type BookendSlot, type Bookends } from "./bookends";
import { pruneBookendFiles } from "./bookendbuild";
import type { TrainingContent } from "./types";

export type BookendHost = {
  type: "training" | "motion";
  notebookId: string;
  content: Record<string, unknown> & { title?: string; bookends?: unknown; progress?: { stage?: string } };
};

const MOTION_BUILDING = new Set(["planning", "artwork", "narration", "rendering"]);

/** The training video or motion explainer a bookend belongs to, or null. */
export function loadHost(id: string): BookendHost | null {
  const row = db.prepare("SELECT notebook_id, type, content FROM artifacts WHERE id = ?").get(id) as unknown as
    | { notebook_id: string; type: string; content: string }
    | undefined;
  if (!row || (row.type !== "training" && row.type !== "motion")) return null;
  try {
    return { type: row.type, notebookId: row.notebook_id, content: JSON.parse(row.content) };
  } catch {
    return null;
  }
}

/** Whether the video is being rendered right now, which is when its bookends must not change. */
export function hostIsRendering(h: BookendHost): boolean {
  return h.type === "training"
    ? isRendering(h.content as unknown as Pick<TrainingContent, "progress">)
    : MOTION_BUILDING.has(h.content.progress?.stage ?? "");
}

export const slotOf = (v: unknown): BookendSlot | null =>
  (BOOKEND_SLOTS as readonly string[]).includes(String(v)) ? (v as BookendSlot) : null;

/** The key under which a slot's generation job is tracked. */
export const jobKey = (slot: BookendSlot | string) => `bookend-${slot}`;

export const readBookends = (id: string): Bookends => normalizeBookends(loadHost(id)?.content.bookends);

/** Replace the bookends on the stored video, leaving every other field as it is, and tidy files nothing uses. */
export function writeBookends(id: string, next: Bookends): Bookends {
  const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as unknown as { content: string } | undefined;
  if (!row) return next;
  const content = { ...JSON.parse(row.content), bookends: next };
  db.prepare("UPDATE artifacts SET content = ? WHERE id = ?").run(JSON.stringify(content), id);
  pruneBookendFiles(id, next);
  return next;
}

/** Change one slot, keeping the other. */
export function updateSlot(id: string, slot: BookendSlot, change: (s: BookendSetting) => BookendSetting): Bookends {
  const b = readBookends(id);
  return writeBookends(id, { ...b, [slot]: change(b[slot]) });
}
