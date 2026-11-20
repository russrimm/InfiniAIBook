"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import StudioCard from "@/components/StudioCard";
import { useDialog } from "@/components/useDialog";
import { readJSONReply } from "@/lib/jsonreply";
import {
  ASPECT_LABELS,
  MAX_PROMPT_CHARS,
  MAX_PROMPTS,
  MAX_REFERENCE_BYTES,
  REFERENCE_TYPES,
  VIDEO_SETUP_URL,
  estimateClipCost,
  formatUsd,
  type ClipAspect,
  type ClipCapabilities,
  type ClipReference,
} from "@/lib/videoclip";
import type { ArtifactSummary } from "@/lib/types";

type Status = {
  configured: boolean;
  reason?: string;
  capabilities?: ClipCapabilities;
  budget?: { enabled: boolean; remainingCents: number | null };
};

const field =
  "min-w-0 flex-1 cursor-pointer rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus";

/**
 * The Studio "Video clip" card. Generate opens a composer where the clip
 * prompts, drafted from the checked sources, can be edited and the cost seen
 * before anything is billed. When no video model is configured the card says
 * so and links to the setup guide instead.
 */
export default function VideoClipCard({
  notebookId,
  selectedIds,
  topic,
  blocked,
  onStarted,
}: {
  notebookId: string;
  selectedIds: string[];
  topic: string;
  blocked: boolean;
  /** Called with the new artifact once its run has started; the panel opens it. */
  onStarted: (artifact: ArtifactSummary) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/videoclip", { cache: "no-store" });
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ configured: false, reason: "Could not check the video model." });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const caps = status?.configured ? status.capabilities : undefined;

  return (
    <>
      <StudioCard
        icon="🎥"
        label="Video clip"
        testId="clip-card"
        busy={false}
        blocked={blocked || !caps}
        onGenerate={() => {
          void load();
          setComposing(true);
        }}
        status={
          status === null ? (
            "Checking for a video model…"
          ) : caps ? (
            `Short AI-generated clips from your sources, made with ${caps.label}. You review the prompts and the cost first.`
          ) : (
            <span data-testid="clip-unconfigured">
              No video model is configured. {status.reason && status.reason !== "No video model is configured." ? `${status.reason} ` : ""}
              <a className="underline" href={VIDEO_SETUP_URL} target="_blank" rel="noreferrer">
                Set one up
              </a>
              .
            </span>
          )
        }
        summary={caps ? `${caps.model} · up to ${Math.max(...caps.durations)} s` : undefined}
        options={
          caps ? (
            <p className="text-[10px] leading-snug text-[var(--muted)]">
              Uses only checked sources. Clips are billed per second by {caps.label}; the composer shows an estimate and nothing is spent until you press Generate there.
            </p>
          ) : undefined
        }
      />
      {composing && caps && (
        <ClipComposer
          caps={caps}
          budget={status?.budget}
          notebookId={notebookId}
          selectedIds={selectedIds}
          topic={topic}
          onClose={() => setComposing(false)}
          onStarted={(a) => {
            setComposing(false);
            onStarted(a);
          }}
        />
      )}
    </>
  );
}

function ClipComposer({
  caps,
  budget,
  notebookId,
  selectedIds,
  topic,
  onClose,
  onStarted,
}: {
  caps: ClipCapabilities;
  budget?: Status["budget"];
  notebookId: string;
  selectedIds: string[];
  topic: string;
  onClose: () => void;
  onStarted: (artifact: ArtifactSummary) => void;
}) {
  const titleId = useId();
  const { dialogRef, backdropProps } = useDialog(onClose);

  const [prompts, setPrompts] = useState<string[]>([""]);
  const [aspect, setAspect] = useState<ClipAspect>(caps.aspects[0]);
  const [duration, setDuration] = useState(caps.durations[0]);
  const [resolution, setResolution] = useState(caps.defaultResolution);
  const [variants, setVariants] = useState(1);
  const [reference, setReference] = useState<(ClipReference & { name: string }) | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const used = prompts.map((p) => p.trim()).filter(Boolean);
  const estimate = estimateClipCost(caps, { prompts: used, variants, duration, resolution });
  const overClipLimit = estimate.clips > caps.maxClips;
  const overBudget =
    budget?.enabled && budget.remainingCents !== null && estimate.totalCents > budget.remainingCents;

  const draft = useCallback(async () => {
    setDrafting(true);
    setError(null);
    setMessage("Drafting clip ideas from your sources…");
    try {
      const res = await fetch("/api/videoclip/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notebookId, sourceIds: selectedIds, topic: topic.trim() || undefined, aspect, duration, count: MAX_PROMPTS }),
      });
      const json = await readJSONReply<{ prompts?: { title: string; prompt: string }[]; error?: string }>(res, "Could not draft clip prompts");
      const drafted = (json.prompts ?? []).map((p) => p.prompt);
      if (drafted.length) setPrompts(drafted);
      setMessage(drafted.length ? `Drafted ${drafted.length} idea${drafted.length === 1 ? "" : "s"}. Edit them before generating.` : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft clip prompts.");
      setMessage("");
    } finally {
      setDrafting(false);
    }
    // Drafting depends on the options at the moment it starts, not on later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId, selectedIds, topic]);

  const drafted = useRef(false);
  useEffect(() => {
    if (drafted.current) return;
    drafted.current = true;
    void draft();
  }, [draft]);

  const pickReference = (file: File | undefined) => {
    setError(null);
    if (!file) return setReference(null);
    if (!(REFERENCE_TYPES as readonly string[]).includes(file.type)) {
      return setError("The reference image must be a JPEG, PNG or WebP picture.");
    }
    if (file.size > MAX_REFERENCE_BYTES) {
      return setError(`Use a reference image under ${Math.round(MAX_REFERENCE_BYTES / 1024 / 1024)} MB.`);
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result).replace(/^data:[^,]*,/, "");
      setReference({ mime: file.type as ClipReference["mime"], data, name: file.name });
    };
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/videoclip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notebookId,
          sourceIds: selectedIds,
          topic: topic.trim() || undefined,
          prompts: used,
          aspect,
          duration,
          resolution,
          variants,
          ...(reference ? { reference: { mime: reference.mime, data: reference.data } } : {}),
        }),
      });
      const json = await readJSONReply<ArtifactSummary & { error?: string }>(res, "Could not start the clips");
      onStarted(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the clips.");
      setStarting(false);
    }
  };

  const label = "text-[10px] tracking-wide text-[var(--muted)] uppercase";

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-6" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="clip-composer"
        className="fade-up flex w-full max-w-2xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:max-h-full sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id={titleId} className="flex-1 text-[15px] font-semibold">
            Video clip
          </h2>
          <button type="button" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          <section aria-labelledby={`${titleId}-prompts`} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 id={`${titleId}-prompts`} className={`${label} flex-1`}>
                Clip prompts
              </h3>
              <button type="button" className="btn !px-2 !py-1 !text-[11px]" onClick={() => void draft()} disabled={drafting}>
                {drafting ? "Drafting…" : "Redraft from sources"}
              </button>
            </div>
            {prompts.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <label className="sr-only" htmlFor={`${titleId}-p${i}`}>{`Clip prompt ${i + 1}`}</label>
                <textarea
                  id={`${titleId}-p${i}`}
                  data-testid="clip-prompt"
                  className="min-h-[5.5rem] min-w-0 flex-1 resize-y rounded-md border border-[var(--border)] bg-well px-2 py-1.5 text-[13px] leading-snug outline-none focus:border-focus"
                  value={p}
                  maxLength={MAX_PROMPT_CHARS}
                  placeholder="Describe one continuous shot: subject, action, setting, lighting, camera movement. No on-screen text."
                  onChange={(e) => setPrompts((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {prompts.length > 1 && (
                  <button
                    type="button"
                    className="btn !px-2 !py-1 !text-[11px]"
                    aria-label={`Remove prompt ${i + 1}`}
                    onClick={() => setPrompts((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {prompts.length < MAX_PROMPTS && (
              <button type="button" className="btn !px-2 !py-1 !text-[11px]" onClick={() => setPrompts((prev) => [...prev, ""])}>
                Add a prompt
              </button>
            )}
            <p role="status" aria-live="polite" className="min-h-[1rem] text-[11px] text-[var(--muted)]">
              {message}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <span className={`w-16 shrink-0 ${label}`}>Shape</span>
              <select className={field} value={aspect} onChange={(e) => setAspect(e.target.value as ClipAspect)}>
                {caps.aspects.map((a) => (
                  <option key={a} value={a}>
                    {ASPECT_LABELS[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className={`w-16 shrink-0 ${label}`}>Length</span>
              <select className={field} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {caps.durations.map((d) => (
                  <option key={d} value={d}>
                    {d} seconds
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className={`w-16 shrink-0 ${label}`}>Quality</span>
              <select className={field} value={resolution} onChange={(e) => setResolution(e.target.value)}>
                {caps.resolutions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className={`w-16 shrink-0 ${label}`}>Variants</span>
              <select className={field} value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
                {Array.from({ length: caps.maxVariants }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} of each prompt
                  </option>
                ))}
              </select>
            </label>
          </section>

          {caps.referenceImage && (
            <section className="space-y-1">
              <label className={label} htmlFor={`${titleId}-ref`}>
                Reference image (optional)
              </label>
              <input
                id={`${titleId}-ref`}
                type="file"
                accept={REFERENCE_TYPES.join(",")}
                className="block w-full text-[11px] text-[var(--muted)]"
                onChange={(e) => pickReference(e.target.files?.[0])}
              />
              <p className="text-[10px] leading-snug text-[var(--muted)]">
                A still the clip starts from. Pictures of recognizable people are usually refused.
                {reference ? ` Using ${reference.name}.` : ""}
              </p>
            </section>
          )}

          <section className="rounded-xl border border-[var(--border)] bg-well px-3 py-2" aria-labelledby={`${titleId}-cost`}>
            <h3 id={`${titleId}-cost`} className={label}>
              Estimated cost
            </h3>
            <p className="mt-1 text-[13px]" data-testid="clip-estimate">
              <strong>{formatUsd(estimate.totalUsd)}</strong> for {estimate.clips} clip{estimate.clips === 1 ? "" : "s"} of {duration} s
              ({estimate.secondsTotal} seconds in all)
            </p>
            <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
              An estimate, not a quote, at {formatUsd(caps.prices[resolution] ?? 0)} per second. {caps.priceNote}
              {budget?.enabled && budget.remainingCents !== null
                ? ` Today's budget has ${formatUsd(budget.remainingCents / 100)} left.`
                : ""}
            </p>
            {overBudget && (
              <p role="alert" className="mt-1 text-[11px] text-red-300">
                This is more than today&apos;s remaining budget. Make fewer or shorter clips, or raise DAILY_BUDGET_USD.
              </p>
            )}
            {overClipLimit && (
              <p role="alert" className="mt-1 text-[11px] text-red-300">
                The most for one run is {caps.maxClips} clips.
              </p>
            )}
          </section>

          {error && (
            <p role="alert" className="text-[11px] leading-snug text-red-300" data-testid="clip-error">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--border)] px-5 py-3">
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-[var(--muted)]">
            Generated video is AI-made and can contain mistakes. The provider may refuse prompts that break its content rules.
          </p>
          <button
            type="button"
            className="btn shrink-0 !text-xs"
            data-testid="clip-generate"
            disabled={starting || drafting || used.length === 0 || overClipLimit || Boolean(overBudget)}
            onClick={() => void generate()}
          >
            {starting ? "Starting…" : `Generate ${estimate.clips || ""} clip${estimate.clips === 1 ? "" : "s"} · ${formatUsd(estimate.totalUsd)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
