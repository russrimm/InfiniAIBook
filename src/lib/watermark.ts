import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { watermarkDir } from "./paths";
import { runPythonRenderer } from "./python";
import { pngFromDataUrl } from "./trainingroute";
import {
  MAX_WATERMARK_BYTES,
  WATERMARK_OPACITIES,
  WATERMARK_SIZES,
  isWatermarkImageId,
  normalizeWatermark,
  type WatermarkImage,
} from "./watermarkchoice";

/**
 * The watermark image library (PNGs uploaded in the app, under
 * `.data/watermarks`) and the step that stamps a watermark onto a finished MP4.
 */

const userError = (message: string, status = 400) =>
  Object.assign(new Error(message), { status });

type Entry = WatermarkImage & { file: string };

const displayName = (base: string) =>
  base.replace(/[_]+/g, " ").replace(/\s{2,}/g, " ").trim() || "Untitled image";

function entries(): Entry[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(watermarkDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const e of names) {
    if (!e.isFile() || path.extname(e.name).toLowerCase() !== ".png") continue;
    const m = /^(w-[A-Za-z0-9_-]{10})--(.*)$/.exec(path.basename(e.name, ".png"));
    if (!m) continue;
    const file = path.join(watermarkDir(), e.name);
    out.push({ id: m[1]!, name: displayName(m[2]!), bytes: fs.statSync(file).size, file });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function listWatermarkImages(): WatermarkImage[] {
  return entries().map(({ id, name, bytes }) => ({ id, name, bytes }));
}

export function watermarkImageFile(id: string): string | null {
  if (!isWatermarkImageId(id)) return null;
  return entries().find((e) => e.id === id)?.file ?? null;
}

/** Store a PNG sent as a data URL. The browser converts every upload to PNG first. */
export function saveWatermarkImage(originalName: unknown, dataUrl: unknown): WatermarkImage {
  let png: Buffer;
  try {
    png = pngFromDataUrl(dataUrl, MAX_WATERMARK_BYTES);
  } catch (e) {
    const status = (e as { status?: number }).status;
    throw userError((e as Error).message, status === 413 ? 413 : 400);
  }
  const raw = typeof originalName === "string" ? originalName : "";
  const slug =
    path
      .basename(raw, path.extname(raw))
      .replace(/[^A-Za-z0-9 ._-]/g, "")
      .replace(/-{2,}/g, "-")
      .trim()
      .replace(/^[-_. ]+|[-_. ]+$/g, "")
      .slice(0, 60) || "image";
  const id = `w-${nanoid(10)}`;
  fs.mkdirSync(watermarkDir(), { recursive: true });
  fs.writeFileSync(path.join(watermarkDir(), `${id}--${slug}.png`), png);
  return { id, name: displayName(slug), bytes: png.byteLength };
}

export function deleteWatermarkImage(id: string): boolean {
  const file = watermarkImageFile(id);
  if (!file) return false;
  fs.unlinkSync(file);
  return true;
}

/**
 * Stamp a watermark onto every frame of an MP4. Writes to a temporary file and
 * replaces the input on success, so a failed stamp leaves the video intact.
 * Returns false when there is no watermark to stamp.
 */
export async function applyWatermark(mediaFile: string, choice: unknown): Promise<boolean> {
  const mark = normalizeWatermark(choice);
  if (!mark) return false;
  const image = mark.kind === "image" ? watermarkImageFile(mark.image) : null;
  if (mark.kind === "image" && !image) {
    throw new Error("The watermark image is no longer in the library.");
  }

  const tmp = mediaFile.replace(/\.mp4$/i, "") + "-watermarked.mp4";
  const configPath = `${mediaFile}.watermark.json`;
  const size = WATERMARK_SIZES[mark.size];
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      input: mediaFile,
      output: tmp,
      position: mark.position,
      opacity: WATERMARK_OPACITIES[mark.opacity].alpha,
      ...(mark.kind === "text"
        ? { text: mark.text, text_height: size.text }
        : { image, max_width: size.width, max_height: size.height }),
    })
  );
  try {
    await runPythonRenderer(["video", "watermark.py"], configPath);
    if (!fs.existsSync(tmp)) throw new Error("The watermark step produced no file.");
    try {
      fs.renameSync(tmp, mediaFile);
    } catch {
      // Windows refuses to replace a file a player still has open.
      fs.rmSync(mediaFile, { force: true });
      fs.renameSync(tmp, mediaFile);
    }
    return true;
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

/**
 * The step every video build runs last: stamp the chosen watermark, or keep
 * the finished video unmarked (with a note saying so) if that fails. A
 * rendered video is worth more than the mark on it.
 */
export async function stampWatermark(
  mediaFile: string,
  choice: unknown,
  tag: string
): Promise<{ watermarked: boolean; note?: string }> {
  try {
    return { watermarked: await applyWatermark(mediaFile, choice) };
  } catch (e) {
    console.warn(`[${tag}] watermark failed, keeping the video without it`, e);
    return {
      watermarked: false,
      note: "The watermark could not be added, so the video was saved without it.",
    };
  }
}
