import { db } from "./db";
import { scriptOf, type PodcastScript, type ScriptTurn } from "./podcastscript";
import type { SpeakerId } from "./voices";

export { scriptOf };

/** Reading and writing audio-overview rows for the script editor and narration. */

/** A narration older than this is assumed to have died with its process. */
export const NARRATION_STALE_MS = 20 * 60_000;

export type StoredPodcast = Record<string, unknown> & {
  title?: string;
  description?: string;
  stage?: string;
  narratingAt?: number;
  note?: string;
  script?: PodcastScript;
  turns?: (ScriptTurn & { at?: number })[];
  chapters?: { title: string; at: number }[];
  audioUrl?: string;
  speakers?: { id: SpeakerId; name?: string; voice?: string; role?: string }[];
  settings?: { preset?: string; rate?: number; breath?: number };
  /** Older overviews stored the speed here, not in `settings`. */
  rate?: number;
  musicChoice?: unknown;
  narration?: unknown;
  editedSinceNarration?: boolean;
};

export const isNarrating = (c: StoredPodcast) =>
  c.stage === "narrating" && Date.now() - Number(c.narratingAt ?? 0) < NARRATION_STALE_MS;

export function readPodcast(id: string): StoredPodcast | null {
  const row = db
    .prepare("SELECT type, content FROM artifacts WHERE id = ?")
    .get(id) as unknown as { type: string; content: string } | undefined;
  if (!row || row.type !== "podcast") return null;
  return JSON.parse(row.content) as StoredPodcast;
}

export function writePodcast(id: string, content: StoredPodcast) {
  db.prepare("UPDATE artifacts SET content = ?, title = ? WHERE id = ?").run(
    JSON.stringify(content),
    String(content.title ?? "Audio overview"),
    id
  );
}

/**
 * Release an overview whose narration died with its process, so the editor is
 * not locked forever. Returns true when the row was reset.
 */
export function reconcileStalledPodcast(id: string): boolean {
  const c = readPodcast(id);
  if (!c || c.stage !== "narrating" || isNarrating(c)) return false;
  writePodcast(id, {
    ...c,
    stage: c.audioUrl ? "done" : "script",
    narratingAt: undefined,
    note: "Narration stopped before it finished — usually because the server restarted. Narrate again to retry.",
  });
  return true;
}

export function reconcileStalledPodcasts(notebookId: string): void {
  const rows = db
    .prepare(
      "SELECT id FROM artifacts WHERE type = 'podcast' AND notebook_id = ? AND content LIKE '%\"stage\":\"narrating\"%'"
    )
    .all(notebookId) as unknown as { id: string }[];
  for (const r of rows) reconcileStalledPodcast(r.id);
}
