/** Small helpers shared by the /api/training/:id/* routes. */
import { db } from "./db";
import type { TrainingContent } from "./types";

export function loadTraining(id: string): { notebookId: string; content: TrainingContent } | null {
  const row = db
    .prepare("SELECT notebook_id, type, content FROM artifacts WHERE id = ?")
    .get(id) as unknown as { notebook_id: string; type: string; content: string } | undefined;
  if (!row || row.type !== "training") return null;
  try {
    return { notebookId: row.notebook_id, content: JSON.parse(row.content) as TrainingContent };
  } catch {
    return null;
  }
}

export function saveTrainingContent(id: string, content: TrainingContent) {
  db.prepare("UPDATE artifacts SET content = ?, title = ? WHERE id = ?").run(
    JSON.stringify(content),
    content.title,
    id
  );
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode a `data:image/png;base64,` URL, refusing anything that is not a PNG. */
export function pngFromDataUrl(dataUrl: unknown, maxBytes: number): Buffer {
  const m = typeof dataUrl === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) throw Object.assign(new Error("Expected a PNG image."), { status: 400 });
  // Base64 is 4/3 the size of the bytes; refuse before decoding something huge.
  if ((m[1].length * 3) / 4 > maxBytes) {
    throw Object.assign(new Error(`The image is larger than ${Math.round(maxBytes / 1_048_576)} MB.`), {
      status: 413,
    });
  }
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 64 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw Object.assign(new Error("Expected a PNG image."), { status: 400 });
  }
  return buf;
}
