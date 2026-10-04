/**
 * Pictures for training-video slides: a real screenshot from Microsoft Learn
 * when the visual has a search for one, otherwise an illustration from the
 * image model when it has a description.
 */
import fs from "node:fs";
import { nanoid } from "nanoid";
import { generateImage } from "./ai";
import { imageDir, imagePath } from "./paths";
import { LEARN_CREDIT, findLearnScreenshot, type LearnImage } from "./learnimages";
import { cueNeedsPicture, type TrainingCue } from "./trainingvisuals";
import type { MotionPalette } from "./motion";
import type { TrainingSection } from "./types";

export type FoundPicture = { imageId: string; credit?: string; source?: string };

/** Whether the planner and the fill may ask the image model for pictures. */
export const trainingImagesEnabled = () => !/^(0|false|off|no)$/i.test(process.env.TRAINING_IMAGES ?? "");

function store(bytes: Buffer): string {
  const imageId = nanoid(12);
  fs.mkdirSync(imageDir(), { recursive: true });
  fs.writeFileSync(imagePath(imageId), bytes);
  return imageId;
}

export async function drawTrainingPicture(prompt: string, pal: MotionPalette): Promise<string> {
  const { png } = await generateImage(
    `${prompt}. Clean, modern editorial illustration for a corporate training video, ` +
      `soft lighting, uncluttered composition with room around the subject, ` +
      `color accents in ${pal.primary} and ${pal.accent}. ` +
      `No text, letters, numbers, logos or watermarks anywhere in the picture.`,
    { size: "1536x1024", quality: "medium" }
  );
  return store(png);
}

/** State shared across the visuals of one video, so a picture is used once. */
export type PictureSession = { used: Set<string>; pages: Map<string, LearnImage[]> };
export const pictureSession = (sections: TrainingSection[] = [], exclude: string[] = []): PictureSession => ({
  used: new Set([...sections.flatMap((s) => s.cues ?? []).map((q) => q.imageSource ?? ""), ...exclude].filter(Boolean)),
  pages: new Map(),
});

/**
 * One picture for a visual: Learn first, then the image model. Null when
 * neither produced one; the image model's errors are thrown only when it was
 * the sole way to get a picture.
 */
export async function findPicture(
  want: { query?: string; prompt?: string },
  pal: MotionPalette,
  session: PictureSession = pictureSession(),
  opts: { ai?: boolean } = {}
): Promise<FoundPicture | null> {
  if (want.query?.trim()) {
    const shot = await findLearnScreenshot(want.query, session.used, session.pages);
    if (shot) {
      session.used.add(shot.src);
      return { imageId: store(shot.bytes), credit: LEARN_CREDIT, source: shot.src };
    }
  }
  if (want.prompt?.trim() && opts.ai !== false) {
    return { imageId: await drawTrainingPicture(want.prompt.trim(), pal) };
  }
  return null;
}

/**
 * Give every visual that still lacks its picture one, in place. Runs a few at
 * a time and stops starting new ones at the deadline, so planning a video
 * never waits on pictures for long; the rest are filled when it is rendered.
 */
export async function fillCuePictures(
  sections: TrainingSection[],
  pal: MotionPalette,
  opts: { ai: boolean; deadline: number; concurrency?: number }
): Promise<{ filled: number; missing: number }> {
  const queue: TrainingCue[] = sections.flatMap((s) => (s.cues ?? []).filter(cueNeedsPicture));
  const session = pictureSession(sections);
  let filled = 0;
  const worker = async () => {
    for (let cue = queue.shift(); cue; cue = queue.shift()) {
      if (Date.now() > opts.deadline) return;
      try {
        const got = await findPicture({ query: cue.imageQuery, prompt: cue.imagePrompt }, pal, session, { ai: opts.ai });
        if (!got) continue;
        cue.imageId = got.imageId;
        if (got.credit) cue.imageCredit = got.credit;
        if (got.source) cue.imageSource = got.source;
        filled++;
      } catch (e) {
        console.warn("[training] picture failed", e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker));
  const missing = sections.flatMap((s) => s.cues ?? []).filter(cueNeedsPicture).length;
  return { filled, missing };
}
