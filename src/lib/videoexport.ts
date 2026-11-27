import type { Artifact } from "./types";

/** Artifact types that are rendered to an MP4. */
export const VIDEO_TYPES = ["video", "motion", "training"] as const;

export const isVideoArtifact = (type: string): boolean =>
  (VIDEO_TYPES as readonly string[]).includes(type);

/** Build stages across whiteboard, motion and training renders. */
const IN_FLIGHT = new Set([
  "planning",
  "artwork",
  "narration",
  "rendering",
  "submitting",
  "submitted",
  "downloading",
  "composing",
]);

export type VideoExportState =
  | { kind: "ready"; href: string; filename: string }
  | { kind: "rendering" }
  | { kind: "failed"; note?: string }
  | { kind: "not-rendered" };

/** A download name for a video: the title with filesystem-hostile characters removed. */
export function videoFilename(title: string, ext = "mp4"): string {
  const base = title.replace(/[^\w\s-]/g, "").slice(0, 60).trim();
  return `${base || "video"}.${ext}`;
}

/** The video URL asking the server to send the file as an attachment. */
export function videoDownloadHref(videoUrl: string): string {
  return `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}download=1`;
}

/** A Content-Disposition value that is safe for any filename. */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Whether a video artifact has a finished MP4 to hand over, and if not, why. */
export function videoExportState(
  artifact: Pick<Artifact, "title" | "content">
): VideoExportState {
  const c = artifact.content as unknown as {
    videoUrl?: string;
    progress?: { stage?: string; note?: string };
  };
  const stage = c.progress?.stage ?? "";
  if (IN_FLIGHT.has(stage)) return { kind: "rendering" };
  if (c.videoUrl) {
    return {
      kind: "ready",
      href: videoDownloadHref(c.videoUrl),
      filename: videoFilename(artifact.title),
    };
  }
  return stage === "failed"
    ? { kind: "failed", note: c.progress?.note }
    : { kind: "not-rendered" };
}
