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

export function voiceDir(): string {
  return path.join(dataDir(), "voices");
}

export function videoDir(): string {
  return path.join(dataDir(), "video");
}

export function videoPath(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}.mp4`);
}

/** Per-video scratch space: artwork, narration clips and the render config. */
export function videoWorkDir(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}-work`);
}

export function removeVideo(id: string) {
  try {
    fs.unlinkSync(videoPath(id));
  } catch {
    /* already gone */
  }
  try {
    fs.rmSync(videoWorkDir(id), { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/**
 * Cached "hello" sample for one speaker. Names come from a fixed list, so
 * anything outside a bare word is a caller bug rather than a new voice.
 */
export function voicePreviewPath(name: string): string {
  if (!/^[A-Za-z]{1,32}$/.test(name)) throw new Error("Invalid speaker name");
  return path.join(voiceDir(), `${name.toLowerCase()}.mp3`);
}
