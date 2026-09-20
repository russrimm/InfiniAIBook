import fs from "node:fs";
import path from "node:path";

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), ".data");
}

export function audioDir(): string {
  return path.join(dataDir(), "audio");
}

export function audioPath(id: string): string {
  // Guard against traversal: ids are nanoid, so anything else is rejected.
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid audio id");
  return path.join(audioDir(), `${id}.mp3`);
}

export function removeAudio(id: string) {
  try {
    fs.unlinkSync(audioPath(id));
  } catch {
    /* already gone */
  }
}

export function imageDir(): string {
  return path.join(dataDir(), "images");
}

export function imagePath(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid image id");
  return path.join(imageDir(), `${id}.png`);
}

export function removeImage(id: string) {
  try {
    fs.unlinkSync(imagePath(id));
  } catch {
    /* already gone */
  }
}
