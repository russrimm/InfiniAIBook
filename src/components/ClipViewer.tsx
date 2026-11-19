"use client";

import { useEffect, useRef, useState } from "react";
import { ASPECT_LABELS, formatUsd, type ClipAspect } from "@/lib/videoclip";
import type { ClipContent, ClipItem } from "@/lib/types";

const STATUS_LABEL: Record<ClipItem["status"], string> = {
  queued: "Waiting",
  in_progress: "Generating",
  downloading: "Downloading",
  completed: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
};

const safeName = (title: string, i: number) =>
  `${title.replace(/[^\w\s-]/g, "").trim().slice(0, 50) || "clip"}-${i + 1}.mp4`;

/**
 * A set of generated clips: live progress while they are made, then a player
 * for each with its prompt, a download and any provider message for the ones
 * that failed. Polls through `onRefresh` like the other long builds.
 */
export default function ClipViewer({
  artifactId,
  content,
  onRefresh,
}: {
  artifactId: string;
  content: ClipContent;
  onRefresh: () => Promise<void> | void;
}) {
  const generating = content.progress?.stage === "generating";
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;
  const [cancelling, setCancelling] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(content.title);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) return;
    const poll = setInterval(() => void Promise.resolve(refresh.current()).catch(() => {}), 3000);
    return () => clearInterval(poll);
  }, [generating]);

  useEffect(() => {
    if (!generating) setCancelling(false);
  }, [generating]);

  const cancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/videoclip/${artifactId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error("Could not cancel.");
      await refresh.current();
    } catch (e) {
      setCancelling(false);
      setError(e instanceof Error ? e.message : "Could not cancel.");
    }
  };

  const rename = async () => {
    const title = name.trim();
    if (!title || title === content.title) {
      setRenaming(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/artifacts/${artifactId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Could not rename the clips.");
      setRenaming(false);
      await refresh.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename the clips.");
    }
  };

  const p = content.progress;
  const summary = generating
    ? `Making ${p.total} clip${p.total === 1 ? "" : "s"}: ${p.done} ready${p.failed ? `, ${p.failed} failed` : ""}.`
    : p.stage === "done"
      ? `${p.total} clip${p.total === 1 ? "" : "s"} ready.`
      : p.stage === "partial"
        ? `${p.done} of ${p.total} clips ready; ${p.failed} failed.`
        : p.stage === "cancelled"
          ? "Cancelled."
          : "No clips were made.";

  return (
    <div className="space-y-4" data-testid="clip-viewer">
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" aria-live="polite" aria-atomic="true" className="mr-auto text-[13px]" data-testid="clip-summary">
          {generating && (
            <span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] align-[-1px] motion-safe:animate-spin" />
          )}
          {summary}
        </p>
        {generating && (
          <button type="button" className="btn !px-2.5 !py-1.5 !text-xs" onClick={() => void cancel()} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel"}
          </button>
        )}
        {!generating && !renaming && (
          <button type="button" className="btn !px-2.5 !py-1.5 !text-xs" onClick={() => { setName(content.title); setRenaming(true); }}>
            Rename
          </button>
        )}
      </div>

      {renaming && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <label className="sr-only" htmlFor="clip-name">Clip set name</label>
          <input
            id="clip-name"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-well px-2 py-1.5 text-[13px] outline-none focus:border-focus"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn !px-2.5 !py-1.5 !text-xs">Save</button>
          <button type="button" className="btn !px-2.5 !py-1.5 !text-xs" onClick={() => setRenaming(false)}>Cancel</button>
        </form>
      )}

      {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}

      <ul className={`grid gap-4 ${content.options.aspect === "9:16" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
        {content.clips.map((clip) => (
          <li key={clip.index} className="space-y-2 rounded-xl border border-[var(--border)] bg-well p-3" data-testid="clip-item">
            <div
              className="flex items-center justify-center overflow-hidden rounded-lg bg-black"
              style={{ aspectRatio: content.options.aspect.replace(":", " / ") }}
            >
              {clip.status === "completed" && clip.videoUrl ? (
                <video
                  className="h-full w-full object-contain"
                  src={clip.videoUrl}
                  poster={clip.posterUrl}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Clip ${clip.index + 1}: ${clip.prompt.slice(0, 80)}`}
                />
              ) : (
                <ClipStatus clip={clip} />
              )}
            </div>
            <p className="line-clamp-3 text-[11px] leading-snug text-prose-soft" title={clip.prompt}>{clip.prompt}</p>
            {clip.status === "failed" && clip.error && (
              <p role="alert" className="text-[11px] leading-snug text-red-300">
                {clip.moderation ? "Declined by the content filter. " : ""}
                {clip.error}
              </p>
            )}
            {clip.status === "completed" && clip.videoUrl && (
              <a className="btn inline-block !px-2.5 !py-1 !text-[11px]" href={clip.videoUrl} download={safeName(content.title, clip.index)}>
                Download MP4
              </a>
            )}
          </li>
        ))}
      </ul>

      <p className="text-[11px] leading-snug text-[var(--muted)]">
        {content.provider.label} · {content.provider.model} ·{" "}
        {ASPECT_LABELS[content.options.aspect as ClipAspect] ?? content.options.aspect} · {content.options.duration} s ·{" "}
        {content.options.resolution} · estimated {formatUsd(content.estimate.usd)}. {content.estimate.priceNote} AI-generated video;
        check it before you rely on it.
      </p>
    </div>
  );
}

function ClipStatus({ clip }: { clip: ClipItem }) {
  const busy = clip.status === "queued" || clip.status === "in_progress" || clip.status === "downloading";
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-[11px] text-[var(--muted)]">
      {busy && (
        <span aria-hidden className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] motion-safe:animate-spin" />
      )}
      <span>{STATUS_LABEL[clip.status]}</span>
      {busy && typeof clip.progress === "number" && clip.progress > 0 && clip.progress < 100 && (
        <div
          role="progressbar"
          aria-label={`Clip ${clip.index + 1} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clip.progress)}
          className="h-1 w-32 overflow-hidden rounded-full bg-track-soft"
        >
          <div className="h-full rounded-full bg-[var(--accent)] transition-all motion-reduce:transition-none" style={{ width: `${clip.progress}%` }} />
        </div>
      )}
      {clip.note && <span className="max-w-[16rem] text-[11px]">{clip.note}</span>}
    </div>
  );
}
