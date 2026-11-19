import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { bookendClipPath, bookendDir } from "./paths";
import { runPythonRenderer } from "./python";
import { BOOKEND_SLOTS, FADE_SECONDS, bookendProblems, planBookends, type BookendPlan, type Bookends, type BookendSlot } from "./bookends";
import { looksLikeMp4 } from "./videohttp";

/**
 * Server side of intro and outro clips: finding their files, measuring them,
 * and putting them around a finished video.
 */

export type ProbeInfo = { duration: number; width: number; height: number; fps: number; audio: boolean };

/** Measure video files with the bundled ffmpeg. An unreadable file maps to null. */
export async function probeVideos(files: string[], workDir: string): Promise<Record<string, ProbeInfo | null>> {
  fs.mkdirSync(workDir, { recursive: true });
  const stamp = nanoid(8);
  const config = path.join(workDir, `probe-${stamp}.json`);
  const result = path.join(workDir, `probe-${stamp}-result.json`);
  fs.writeFileSync(config, JSON.stringify({ op: "probe", files, result }));
  try {
    await runPythonRenderer(["bookends", "bookends.py"], config);
    return JSON.parse(fs.readFileSync(result, "utf8")) as Record<string, ProbeInfo | null>;
  } finally {
    for (const f of [config, result]) fs.rmSync(f, { force: true });
  }
}

/** Reasons a render must not start: a requested bookend with no usable clip. Empty when fine. */
export function bookendBlockers(id: string, b: Bookends): string[] {
  return bookendProblems(b, (clipId) => fs.existsSync(bookendClipPath(id, clipId)));
}

/** A render that was refused because a requested bookend has no clip. */
export class BookendBlockedError extends Error {
  readonly status = 409;
  constructor(readonly problems: string[]) {
    super(problems.join(" "));
  }
}

export function assertBookendsReady(id: string, b: Bookends): void {
  const problems = bookendBlockers(id, b);
  if (problems.length) throw new BookendBlockedError(problems);
}

/** Store an MP4 (an upload or a copy of a library clip) as a bookend clip and measure it. */
export async function storeBookendFile(
  id: string,
  source: { bytes?: Uint8Array; file?: string },
  workDir: string,
): Promise<{ clipId: string; seconds: number }> {
  const head = source.bytes ? source.bytes.subarray(0, 12) : fs.readFileSync(source.file!).subarray(0, 12);
  if (!looksLikeMp4(head)) throw Object.assign(new Error("That is not an MP4 video."), { status: 400 });
  const clipId = nanoid(12);
  const dest = bookendClipPath(id, clipId);
  fs.mkdirSync(bookendDir(id), { recursive: true });
  if (source.bytes) fs.writeFileSync(dest, source.bytes);
  else fs.copyFileSync(source.file!, dest);
  const info = (await probeVideos([dest], workDir))[dest];
  if (!info || info.duration <= 0.2) {
    fs.rmSync(dest, { force: true });
    throw Object.assign(new Error("That video could not be read. Try another MP4."), { status: 400 });
  }
  return { clipId, seconds: Math.round(info.duration * 100) / 100 };
}

/** Delete bookend clip files no slot refers to any more. Recent files are spared: one may still be downloading. */
export function pruneBookendFiles(id: string, b: Bookends, graceMs = 15 * 60_000): void {
  const keep = new Set(BOOKEND_SLOTS.flatMap((s) => (b[s].clipId ? [b[s].clipId!] : [])));
  let names: string[] = [];
  try {
    names = fs.readdirSync(bookendDir(id));
  } catch {
    return;
  }
  for (const name of names) {
    const base = name.replace(/\.(mp4|jpg|part)$/, "");
    if (keep.has(base)) continue;
    const file = path.join(bookendDir(id), name);
    try {
      if (Date.now() - fs.statSync(file).mtimeMs < graceMs) continue;
    } catch {
      continue;
    }
    fs.rmSync(file, { force: true });
  }
}

export type BookendResult = {
  /** Which slots were put in. */
  applied: BookendSlot[];
  plan?: BookendPlan;
  /** Set when a requested bookend could not be added: shown to the person, never silent. */
  note?: string;
};

/**
 * Put the requested intro and outro around the finished video at `mediaFile`,
 * replacing it only on success. The main video keeps its own sound, music and
 * captions; they simply start later by `plan.offset`. If the join fails the
 * video is kept as it was and the result says so, because a rendered video is
 * worth more than its bookends, but it must never look as if they were added.
 */
export async function applyBookends(
  id: string,
  mediaFile: string,
  b: Bookends,
  workDir: string,
): Promise<BookendResult> {
  const slots = BOOKEND_SLOTS.filter((s) => b[s].mode !== "off");
  if (!slots.length) return { applied: [] };
  const names = slots.join(" and ");
  const tmp = mediaFile.replace(/\.mp4$/i, "") + "-bookended.mp4";
  const stamp = nanoid(6);
  const config = path.join(workDir, `bookends-${stamp}.json`);
  const resultFile = path.join(workDir, `bookends-${stamp}-result.json`);
  try {
    fs.mkdirSync(workDir, { recursive: true });
    const files: Partial<Record<BookendSlot, string>> = {};
    for (const s of slots) {
      const clip = b[s].clipId;
      const file = clip ? bookendClipPath(id, clip) : null;
      if (!file || !fs.existsSync(file)) throw new Error(`the ${s} clip is missing`);
      files[s] = file;
    }
    fs.writeFileSync(
      config,
      JSON.stringify({
        op: "concat",
        main: mediaFile,
        output: tmp,
        result: resultFile,
        intro: files.intro,
        outro: files.outro,
        mute: { intro: Boolean(b.intro.mute), outro: Boolean(b.outro.mute) },
        fade: FADE_SECONDS[b.fade],
      }),
    );
    await runPythonRenderer(["bookends", "bookends.py"], config);
    if (!fs.existsSync(tmp)) throw new Error("the join produced no file");
    const measured = JSON.parse(fs.readFileSync(resultFile, "utf8")) as { durations: { intro?: number; main: number; outro?: number } };
    try {
      fs.renameSync(tmp, mediaFile);
    } catch {
      // Windows refuses to replace a file a player still has open.
      fs.rmSync(mediaFile, { force: true });
      fs.renameSync(tmp, mediaFile);
    }
    const { intro, main, outro } = measured.durations;
    return { applied: slots, plan: planBookends(main, intro ?? null, outro ?? null, b.fade) };
  } catch (e) {
    console.warn(`[bookends] could not add the ${names}`, e);
    const why = e instanceof Error ? e.message.split("\n").pop()?.slice(0, 200) : "";
    return {
      applied: [],
      note: `The ${names} could not be added${why ? ` (${why})` : ""}, so the video was saved without ${slots.length > 1 ? "them" : "it"}. Render again to retry.`,
    };
  } finally {
    for (const f of [config, resultFile, tmp]) fs.rmSync(f, { force: true });
  }
}
