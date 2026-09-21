"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoContent } from "@/lib/types";

const STAGES: { key: string; label: string }[] = [
  { key: "artwork", label: "Drawing the scenes" },
  { key: "narration", label: "Recording narration" },
  { key: "rendering", label: "Rendering the video" },
];

export default function VideoPlayer({
  artifactId,
  content,
  onRefresh,
}: {
  artifactId: string;
  content: VideoContent;
  /** Pulls the artifact again so progress advances while a build runs. */
  onRefresh: () => Promise<void> | void;
}) {
  const progress = content.progress;
  const stage = progress?.stage ?? (content.videoUrl ? "done" : "artwork");
  const building = stage !== "done" && stage !== "failed";

  const [elapsed, setElapsed] = useState(0);

  // The caller passes a fresh closure on every render. Holding it in a ref
  // keeps it out of the effect's dependencies — with it in there, each poll
  // triggered a re-render, which produced a new callback, which restarted the
  // effect, which polled again: a loop firing every few milliseconds rather
  // than the intended four seconds.
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    if (!building) return;
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    const poll = setInterval(() => {
      // Never let a failed poll surface as a page error. The build outlives
      // dev-server restarts, sleeping laptops and dropped connections.
      void Promise.resolve(refresh.current()).catch(() => {});
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [building]);

  if (stage === "failed") {
    return (
      <div>
        <p className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-[13px] text-red-200">
          {progress?.note ?? "The video could not be built."}
        </p>
        <SceneList content={content} />
      </div>
    );
  }

  if (building) {
    const idx = STAGES.findIndex((s) => s.key === stage);
    return (
      <div>
        <div className="rounded-2xl border border-[var(--border)] bg-[#0e1116] p-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            <span className="text-[13px] font-medium">
              {STAGES[idx]?.label ?? "Working"}
            </span>
            <span className="ml-auto font-mono text-[11px] text-[var(--muted)] tabular-nums">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {STAGES.map((s, i) => {
              const state = i < idx ? "done" : i === idx ? "now" : "todo";
              const pct =
                state === "done"
                  ? 100
                  : state === "now" && progress?.total
                    ? (progress.done / progress.total) * 100
                    : 0;
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span
                    className={`w-40 shrink-0 text-[11px] ${
                      state === "todo" ? "text-[#4b5563]" : "text-[var(--muted)]"
                    }`}
                  >
                    {s.label}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1b2027]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-[10px] text-[var(--muted)] tabular-nums">
                    {state === "now" && progress?.total
                      ? `${progress.done}/${progress.total}`
                      : state === "done"
                        ? "done"
                        : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[11px] leading-snug text-[var(--muted)]">
            This takes several minutes. You can close this and keep working —
            it carries on in the background.
          </p>
        </div>
        <SceneList content={content} />
      </div>
    );
  }

  return (
    <div>
      <video
        src={content.videoUrl}
        controls
        preload="metadata"
        className="w-full rounded-2xl border border-[var(--border)] bg-black"
      />
      <div className="mt-3 flex items-center gap-2">
        {content.description && (
          <p className="flex-1 text-[12px] leading-relaxed text-[var(--muted)]">
            {content.description}
          </p>
        )}
        <a
          className="btn shrink-0 !px-2.5 !py-1 !text-xs"
          href={content.videoUrl}
          download={`${content.title.replace(/[^\w\s-]/g, "").slice(0, 60) || "video"}.mp4`}
        >
          Download
        </a>
      </div>
      <SceneList content={content} />
      <p className="mt-4 text-[10px] text-[var(--muted)]">
        Narrated by {content.voice ?? "Ava"}
        {content.bytes ? ` · ${(content.bytes / 1_048_576).toFixed(1)} MB` : ""}
      </p>
      <input type="hidden" value={artifactId} readOnly />
    </div>
  );
}

function SceneList({ content }: { content: VideoContent }) {
  if (!content.scenes?.length) return null;
  return (
    <>
      <h3 className="mt-6 mb-2 text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
        Scenes
      </h3>
      <ol className="space-y-1">
        {content.scenes.map((s, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5"
          >
            <span className="mt-0.5 w-6 shrink-0 text-center text-[10px] font-semibold text-[var(--muted)]">
              {s.step ?? "—"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold tracking-wide">{s.title}</div>
              <div className="text-[12px] text-[#c9d2dd]">{s.caption}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                {s.narration}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
