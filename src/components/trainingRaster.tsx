"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import TrainingVisual from "./TrainingVisual";
import type { InfographicContent, TrainingContent } from "@/lib/types";
import { compositionPalette, normalizeComposition } from "@/lib/trainingvisuals";
import { rasterJobs, composeInputOf, composeVocabulary, type RasterJob } from "@/lib/trainingtimeline";
import type { CaseVocabulary } from "@/lib/slidecase";

/**
 * Draw every visual the compositor still needs and upload it as a PNG.
 *
 * Runs in the browser because the visuals are React components — the same
 * ones the preview shows — and infographics only exist as components. Each
 * one is mounted off screen at its exact pixel size, given a moment for
 * pictures and fonts, then captured with html-to-image.
 */

const frames = (n: number) =>
  new Promise<void>((resolve) => {
    const step = (left: number) => (left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1)));
    step(n);
  });

async function settle(host: HTMLElement) {
  await frames(2);
  await Promise.all(
    [...host.querySelectorAll("img")].map((img) =>
      img.complete
        ? img.decode().catch(() => {})
        : new Promise<void>((r) => {
            img.addEventListener("load", () => r(), { once: true });
            img.addEventListener("error", () => r(), { once: true });
          })
    )
  );
  await document.fonts.ready;
  await frames(1);
}

export function visualContext(
  c: TrainingContent,
  job: Pick<RasterJob, "section">,
  vocab: CaseVocabulary = composeVocabulary(composeInputOf(c))
) {
  const comp = normalizeComposition(c.composition);
  const s = job.section !== undefined ? c.sections[job.section] : undefined;
  return {
    title: c.title,
    description: c.description,
    objectives: c.objectives ?? [],
    sectionTitle: s?.title,
    sectionIndex: job.section,
    sectionCount: c.sections.length,
    lowerName: comp.lowerThird.name,
    lowerRole: comp.lowerThird.role,
    vocab,
  };
}

export async function prepareRasters(opts: {
  artifactId: string;
  content: TrainingContent;
  infographics: Map<string, InfographicContent>;
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { artifactId, content, infographics } = opts;
  const res = await fetch(`/api/training/${artifactId}/raster`);
  const j = (await res.json().catch(() => ({}))) as { missing?: { key: string; state: number }[]; error?: string };
  if (!res.ok) throw new Error(j.error || "Could not check which visuals need drawing.");
  const missing = j.missing ?? [];
  if (!missing.length) return;

  const jobs = rasterJobs(composeInputOf(content));
  const vocab = composeVocabulary(composeInputOf(content));
  const palette = compositionPalette(normalizeComposition(content.composition));
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;contain:layout paint;";
  document.body.appendChild(host);
  const root = createRoot(host);
  const { toPng, getFontEmbedCSS } = await import("html-to-image");
  let fontEmbedCSS: string | undefined;

  try {
    let done = 0;
    opts.onProgress?.(0, missing.length);
    for (const m of missing) {
      const job = jobs.find((x) => x.key === m.key);
      if (!job) continue;
      const cue =
        job.cueId !== undefined && job.section !== undefined
          ? content.sections[job.section]?.cues?.find((q) => q.id === job.cueId)
          : undefined;
      flushSync(() =>
        root.render(
          <TrainingVisual
            role={job.role}
            width={job.width}
            height={job.height}
            state={m.state}
            palette={palette}
            cue={cue}
            ctx={visualContext(content, job, vocab)}
            infographic={cue?.infographicId ? infographics.get(cue.infographicId) ?? null : null}
          />
        )
      );
      await settle(host);
      const node = host.firstElementChild as HTMLElement | null;
      if (!node) throw new Error("A visual did not render.");
      fontEmbedCSS ??= await getFontEmbedCSS(node).catch(() => "");
      const dataUrl = await toPng(node, {
        width: job.width,
        height: job.height,
        pixelRatio: 1,
        fontEmbedCSS,
        skipFonts: !fontEmbedCSS,
      });
      const put = await fetch(`/api/training/${artifactId}/raster`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: m.key, state: m.state, dataUrl }),
      });
      if (!put.ok) {
        const e = (await put.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error || "Could not save a drawn visual.");
      }
      opts.onProgress?.(++done, missing.length);
    }
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Draw a picture file (any format the browser reads) as a PNG data URL, capped in size. */
export async function fileToPng(file: Blob, maxSide = 2560): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * s));
  canvas.height = Math.max(1, Math.round(bitmap.height * s));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

/**
 * One still of a shared screen, window or tab, as a PNG data URL. Sharing
 * stops as soon as the frame is taken; nothing is recorded.
 */
export async function captureScreenPng(maxSide = 2560): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The first frame of a fresh share is sometimes black; give it a beat.
    await new Promise((r) => setTimeout(r, 350));
    const s = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * s));
    canvas.height = Math.max(1, Math.round(video.videoHeight * s));
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    return canvas.toDataURL("image/png");
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
