"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CLIP_FITS, CLIP_FIT_LABELS, type TrainingCue } from "@/lib/trainingvisuals";
import {
  ASPECT_LABELS,
  MAX_PROMPT_CHARS,
  VIDEO_SETUP_URL,
  estimateClipCost,
  formatUsd,
  type ClipAspect,
  type ClipCapabilities,
} from "@/lib/videoclip";
import type { CueClipState } from "@/lib/trainingclips";

type Status = {
  configured: boolean;
  reason?: string;
  capabilities?: ClipCapabilities;
  budget?: { enabled: boolean; remainingCents: number | null };
};

const inputCls =
  "w-full rounded-md border border-[var(--border)] bg-well px-2.5 py-1.5 text-[13px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:opacity-60";
const labelCls = "mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase";

const STATUS_TEXT: Record<CueClipState["status"], string> = {
  queued: "Waiting for the video model",
  in_progress: "Generating the clip",
  downloading: "Downloading the clip",
  completed: "Clip ready",
  failed: "The clip could not be made",
  cancelled: "Cancelled",
};

/**
 * The settings of a video-clip visual: the prompt, the shape and length, an
 * estimated cost, and Generate, Cancel and Remove. A clip is only ever made when
 * this button is pressed; planning and rendering never start one.
 */
export default function TrainingClipControls({
  artifactId,
  cue,
  disabled,
  onChange,
}: {
  artifactId: string;
  cue: TrainingCue;
  disabled: boolean;
  /** Merged into the latest copy of the cue. */
  onChange: (patch: Partial<TrainingCue>) => void;
}) {
  const id = useId();
  const [status, setStatus] = useState<Status | null>(null);
  const [aspect, setAspect] = useState<ClipAspect>("16:9");
  const [seconds, setSeconds] = useState<number | null>(null);
  const [resolution, setResolution] = useState<string | null>(null);
  const [job, setJob] = useState<CueClipState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const applied = useRef<string | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  const url = `/api/training/${artifactId}/assets/clip`;
  const caps = status?.configured ? status.capabilities : undefined;
  const running = job !== null && (job.status === "queued" || job.status === "in_progress" || job.status === "downloading");

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/videoclip", { cache: "no-store" });
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ configured: false, reason: "Could not check the video model." });
    }
  }, []);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const poll = useCallback(async () => {
    const res = await fetch(`${url}?cueId=${cue.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const j = (await res.json()) as { state: CueClipState | null };
    setJob(j.state);
    // A finished clip is put on the cue once, however many polls see it.
    if (j.state?.status === "completed" && j.state.clipId && applied.current !== j.state.clipId) {
      applied.current = j.state.clipId;
      change.current({ clipId: j.state.clipId, clipSeconds: j.state.seconds });
    }
  }, [url, cue.id]);

  // Pick up a job that was already running when this visual was opened.
  useEffect(() => {
    void poll().catch(() => {});
  }, [poll]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void poll().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [running, poll]);

  const chosenSeconds = seconds ?? caps?.durations[Math.min(1, (caps?.durations.length ?? 1) - 1)] ?? 8;
  const chosenResolution = resolution ?? caps?.defaultResolution ?? "720p";
  const prompt = cue.clipPrompt?.trim() ?? "";
  const estimate = caps
    ? estimateClipCost(caps, { prompts: [prompt || "x"], variants: 1, duration: chosenSeconds, resolution: chosenResolution })
    : null;
  const overBudget = Boolean(
    estimate && status?.budget?.enabled && status.budget.remainingCents !== null && estimate.totalCents > status.budget.remainingCents,
  );

  const generate = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cueId: cue.id, prompt, aspect, seconds: chosenSeconds, resolution: chosenResolution }),
      });
      const j = (await res.json().catch(() => ({}))) as { state?: CueClipState; error?: string };
      if (!res.ok || !j.state) throw new Error(j.error || "Could not start the clip.");
      applied.current = null;
      setJob(j.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the clip.");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    setError(null);
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cueId: cue.id, cancel: true }),
      });
      await poll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel.");
    }
  };

  const locked = disabled || running || starting;

  return (
    <div className="space-y-2" data-testid="clip-controls">
      <label className="block">
        <span className={labelCls}>Clip prompt</span>
        <textarea
          className={`${inputCls} min-h-[4.5rem] resize-y`}
          value={cue.clipPrompt ?? ""}
          maxLength={MAX_PROMPT_CHARS}
          disabled={disabled || running}
          placeholder="One continuous shot: subject, action, setting, lighting, camera movement. No on-screen text."
          onChange={(e) => onChange({ clipPrompt: e.target.value || undefined })}
        />
      </label>

      {status !== null && !caps && (
        <p className="text-[11px] leading-snug text-[var(--muted)]" data-testid="clip-unconfigured">
          No video model is configured, so a clip cannot be made here.{" "}
          <a className="underline" href={VIDEO_SETUP_URL} target="_blank" rel="noreferrer">
            Set one up
          </a>
          .
        </p>
      )}

      {caps && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label>
              <span className={labelCls}>Shape</span>
              <select className={inputCls} value={aspect} disabled={locked} onChange={(e) => setAspect(e.target.value as ClipAspect)}>
                {caps.aspects.map((a) => (
                  <option key={a} value={a}>
                    {ASPECT_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelCls}>Length</span>
              <select className={inputCls} value={chosenSeconds} disabled={locked} onChange={(e) => setSeconds(Number(e.target.value))}>
                {caps.durations.map((d) => (
                  <option key={d} value={d}>
                    {d} seconds
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={labelCls}>Quality</span>
              <select className={inputCls} value={chosenResolution} disabled={locked} onChange={(e) => setResolution(e.target.value)}>
                {caps.resolutions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-[11px] leading-snug text-[var(--muted)]" data-testid="clip-cue-estimate">
            Estimated cost <strong>{estimate ? formatUsd(estimate.totalUsd) : ""}</strong> for one {chosenSeconds} second clip. {caps.priceNote}
            {status?.budget?.enabled && status.budget.remainingCents !== null
              ? ` Today's budget has ${formatUsd(status.budget.remainingCents / 100)} left.`
              : ""}
          </p>
          {overBudget && (
            <p role="alert" className="text-[11px] text-red-300">
              That is more than today&apos;s remaining budget.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn !text-[11px]"
              data-testid="clip-cue-generate"
              disabled={locked || !prompt || overBudget}
              onClick={() => void generate()}
            >
              {starting
                ? "Starting…"
                : cue.clipId
                  ? `Generate another · ${formatUsd(estimate?.totalUsd ?? 0)}`
                  : `Generate clip · ${formatUsd(estimate?.totalUsd ?? 0)}`}
            </button>
            {running && (
              <button type="button" className="btn !text-[11px]" disabled={disabled} onClick={() => void cancel()}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      <p role="status" aria-live="polite" className="min-h-[1rem] text-[11px] text-[var(--muted)]" data-testid="clip-cue-status">
        {job && job.status !== "completed" && job.status !== "failed"
          ? `${STATUS_TEXT[job.status]}${typeof job.progress === "number" && job.progress > 0 && job.progress < 100 ? ` · ${Math.round(job.progress)}%` : ""}${job.note ? ` · ${job.note}` : ""}`
          : job?.status === "completed"
            ? STATUS_TEXT.completed
            : ""}
      </p>
      {(error || job?.status === "failed") && (
        <p role="alert" className="text-[11px] leading-snug text-red-300">
          {error ?? `${job?.moderation ? "Declined by the content filter. " : ""}${job?.error ?? ""}`}
        </p>
      )}

      {cue.clipId && (
        <div className="space-y-2">
          <video
            key={cue.clipId}
            className="max-h-56 w-full rounded-md bg-black object-contain"
            src={`/api/training/${artifactId}/cueclips/${cue.clipId}`}
            controls
            muted
            playsInline
            preload="metadata"
            aria-label="The generated clip for this visual"
            data-testid="clip-cue-video"
          />
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
            <label>
              <span className={labelCls}>If the clip is shorter than the visual</span>
              <select
                className={inputCls}
                value={cue.clipFit ?? "hold"}
                disabled={disabled}
                onChange={(e) => onChange({ clipFit: e.target.value === "loop" ? "loop" : undefined })}
              >
                {CLIP_FITS.map((f) => (
                  <option key={f} value={f}>
                    {CLIP_FIT_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn !text-[11px]"
              id={`${id}-remove`}
              disabled={locked}
              onClick={() => onChange({ clipId: undefined, clipSeconds: undefined, clipFit: undefined })}
            >
              Remove clip
            </button>
          </div>
          <p className="text-[10px] leading-snug text-[var(--muted)]">
            The clip plays without sound while the presenter keeps talking. A clip longer than the visual is cut where the visual ends.
          </p>
        </div>
      )}
      {!cue.clipId && (
        <p className="text-[10px] leading-snug text-[var(--muted)]">
          A visual without a clip is left out of the render. Rendering never makes a clip, so nothing is billed until you press Generate.
        </p>
      )}
    </div>
  );
}
