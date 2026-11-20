import fs from "node:fs";
import path from "node:path";

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
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

/** Background music uploaded through the app. */
export function musicDir(): string {
  return path.join(dataDir(), "music");
}

/** Watermark images uploaded through the app, shared by every video. */
export function watermarkDir(): string {
  return path.join(dataDir(), "watermarks");
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
  for (const dir of [videoWorkDir(id), trainingClipsDir(id), trainingVisualsDir(id), trainingCueClipsDir(id), bookendDir(id)]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
  try {
    fs.unlinkSync(captionsPath(id));
  } catch {
    /* already gone */
  }
}

const HASH = /^[a-f0-9]{40}$/;
const KEY = /^[a-f0-9]{16}$/;

/** AI-generated video clips (Studio "Video clip"), one MP4 and an optional poster per clip. */
export function clipDir(): string {
  return path.join(dataDir(), "clips");
}

export function clipPath(id: string, index: number, ext: "mp4" | "jpg" = "mp4"): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid clip id");
  if (!Number.isInteger(index) || index < 0 || index > 99) throw new Error("Invalid clip number");
  return path.join(clipDir(), `${id}-${index}.${ext}`);
}

/** Delete every clip file an artifact owns. */
export function removeClips(id: string) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return;
  let names: string[] = [];
  try {
    names = fs.readdirSync(clipDir());
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(`${id}-`) && /^\d{1,2}\.(mp4|jpg)(\.part)?$/.test(name.slice(id.length + 1))) {
      try {
        fs.unlinkSync(path.join(clipDir(), name));
      } catch {
        /* already gone */
      }
    }
  }
}

/** Transparent presenter clips of a composed training video, one per section. */
export function trainingClipsDir(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}-clips`);
}

export function trainingClipPath(id: string, hash: string, ext: "webm" | "json" = "webm"): string {
  if (!HASH.test(hash)) throw new Error("Invalid clip hash");
  return path.join(trainingClipsDir(id), `${hash}.${ext}`);
}

/** AI video clips made for the visuals of a training video, one MP4 (and optional still) per clip id. */
export function trainingCueClipsDir(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}-cueclips`);
}

export function trainingCueClipPath(id: string, clipId: string, ext: "mp4" | "jpg" = "mp4"): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(clipId)) throw new Error("Invalid clip id");
  return path.join(trainingCueClipsDir(id), `${clipId}.${ext}`);
}

/** Intro and outro clips of a training video or motion explainer, one MP4 per clip id. */
export function bookendDir(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}-bookends`);
}

export function bookendClipPath(id: string, clipId: string, ext: "mp4" | "jpg" = "mp4"): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(clipId)) throw new Error("Invalid clip id");
  return path.join(bookendDir(id), `${clipId}.${ext}`);
}

/** Visuals the browser drew for the compositor, keyed by their content. */
export function trainingVisualsDir(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}-visuals`);
}

export function trainingRasterPath(id: string, key: string, state: number): string {
  if (!KEY.test(key)) throw new Error("Invalid visual key");
  if (!Number.isInteger(state) || state < 0 || state > 12) throw new Error("Invalid visual state");
  return path.join(trainingVisualsDir(id), `${key}-${state}.png`);
}

export function captionsPath(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error("Invalid video id");
  return path.join(videoDir(), `${id}.vtt`);
}

/** Speech measured for timing previews; shared by every video, keyed by content. */
export function ttsCachePath(hash: string, ext: "mp3" | "json"): string {
  if (!HASH.test(hash)) throw new Error("Invalid speech hash");
  return path.join(videoDir(), "tts-cache", `${hash}.${ext}`);
}

/**
 * Cached "hello" sample for one speaker. Names come from a fixed list, so
 * anything outside a bare word is a caller bug rather than a new voice.
 */
export function voicePreviewPath(name: string): string {
  if (!/^[A-Za-z]{1,32}$/.test(name)) throw new Error("Invalid speaker name");
  return path.join(voiceDir(), `${name.toLowerCase()}.mp3`);
}
