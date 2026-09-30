import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { musicDir } from "./paths";
import {
  MAX_MUSIC_BYTES,
  MUSIC_EXTENSIONS,
  MUSIC_VOLUMES,
  type MusicChoice,
  type MusicTrack,
} from "./musicchoice";
import { runPythonRenderer } from "./python";

/**
 * The background-music library: tracks uploaded in the app (under
 * `.data/music`) plus, read-only, any in the folder `MOTION_MUSIC_DIR` names.
 */

const EXTENSIONS = new Set<string>(MUSIC_EXTENSIONS);

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

const userError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

type Entry = MusicTrack & { file: string };

const displayName = (base: string) =>
  base.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim() || "Untitled track";

function libraryEntries(): Entry[] {
  const dir = musicDir();
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const e of names) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!EXTENSIONS.has(ext)) continue;
    const m = /^(u-[A-Za-z0-9_-]{10})--(.*)$/.exec(path.basename(e.name, path.extname(e.name)));
    if (!m) continue;
    const file = path.join(dir, e.name);
    out.push({
      id: m[1]!,
      name: displayName(m[2]!),
      source: "library",
      bytes: fs.statSync(file).size,
      deletable: true,
      file,
    });
  }
  return out;
}

function folderEntries(): Entry[] {
  const dir = process.env.MOTION_MUSIC_DIR?.trim();
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => {
        const file = path.join(dir, e.name);
        return {
          id: `d-${createHash("sha1").update(e.name).digest("hex").slice(0, 12)}`,
          name: displayName(path.basename(e.name, path.extname(e.name))),
          source: "folder" as const,
          bytes: fs.statSync(file).size,
          deletable: false,
          file,
        };
      });
  } catch {
    return [];
  }
}

function entries(): Entry[] {
  return [...libraryEntries(), ...folderEntries()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function listTracks(): MusicTrack[] {
  return entries().map(({ id, name, source, bytes, deletable }) => ({
    id,
    name,
    source,
    bytes,
    deletable,
  }));
}

export const musicAvailable = () => entries().length > 0;

export function trackFile(id: string): { file: string; contentType: string } | null {
  const e = entries().find((t) => t.id === id);
  if (!e) return null;
  return {
    file: e.file,
    contentType: CONTENT_TYPES[path.extname(e.file).toLowerCase()] ?? "application/octet-stream",
  };
}

/** The file for a choice, picking one at random for "random". Null when there is none. */
export function resolveMusic(
  choice: MusicChoice | null | undefined
): { file: string; id: string; name: string; gain: number } | null {
  if (!choice) return null;
  const all = entries();
  if (!all.length) return null;
  const e =
    choice.track === "random"
      ? all[Math.floor(Math.random() * all.length)]!
      : all.find((t) => t.id === choice.track);
  if (!e) return null;
  return { file: e.file, id: e.id, name: e.name, gain: MUSIC_VOLUMES[choice.volume].gain };
}

export function saveUpload(originalName: string, bytes: Uint8Array): MusicTrack {
  const ext = path.extname(originalName).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    throw userError(`Upload an audio file: ${MUSIC_EXTENSIONS.join(", ")}.`);
  }
  if (!bytes.byteLength) throw userError("That file is empty.");
  if (bytes.byteLength > MAX_MUSIC_BYTES) {
    throw userError(`Tracks are limited to ${Math.round(MAX_MUSIC_BYTES / 1_048_576)} MB.`, 413);
  }
  const slug =
    path
      .basename(originalName, path.extname(originalName))
      .replace(/[^A-Za-z0-9 ._-]/g, "")
      .replace(/-{2,}/g, "-")
      .trim()
      .replace(/^[-_. ]+|[-_. ]+$/g, "")
      .slice(0, 60) || "track";
  const id = `u-${nanoid(10)}`;
  fs.mkdirSync(musicDir(), { recursive: true });
  const file = path.join(musicDir(), `${id}--${slug}${ext}`);
  fs.writeFileSync(file, bytes);
  return { id, name: displayName(slug), source: "library", bytes: bytes.byteLength, deletable: true };
}

export function deleteTrack(id: string): boolean {
  const e = libraryEntries().find((t) => t.id === id);
  if (!e) return false;
  fs.unlinkSync(e.file);
  return true;
}

/**
 * Mix a music bed under an MP3 or an MP4's soundtrack, ducked whenever the
 * voice speaks. Writes to a temporary file and replaces the input on success,
 * so a failed mix leaves the original intact.
 */
export async function mixMusicInto(
  mediaFile: string,
  music: { file: string; gain: number },
  kind: "audio" | "video"
): Promise<void> {
  const ext = path.extname(mediaFile);
  const tmp = mediaFile.replace(new RegExp(`${ext.replace(".", "\\.")}$`), `-mixed${ext}`);
  const configPath = `${mediaFile}.mix.json`;
  fs.writeFileSync(
    configPath,
    JSON.stringify({ input: mediaFile, output: tmp, music: music.file, volume: music.gain, kind })
  );
  try {
    await runPythonRenderer(["audio", "mix.py"], configPath);
    if (!fs.existsSync(tmp)) throw new Error("The music mix produced no file.");
    fs.renameSync(tmp, mediaFile);
  } finally {
    for (const f of [configPath, tmp]) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* already gone */
      }
    }
  }
}
