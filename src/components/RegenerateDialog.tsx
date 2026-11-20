"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fetchEstimate, estimateNote, type EstimateReply } from "@/lib/estimateclient";
import { INFOGRAPHIC_STYLES, MAX_INFOGRAPHIC_INSTRUCTIONS, knownStyle } from "@/lib/infographic";
import { JSONReplyError, readJSONReply } from "@/lib/jsonreply";
import { DEFAULT_SLIDE_THEME, SLIDE_THEMES } from "@/lib/slides";
import { STUDIO, studioLabel } from "@/lib/studio";
import type { Artifact, ArtifactType, StudyDifficulty, StudyLength } from "@/lib/types";
import { useDialog } from "./useDialog";

/** Formats made by one model call from the notebook's sources, so they can be redone here. */
export const REGENERABLE: ReadonlySet<string> = new Set([
  "report",
  "briefing",
  "study_guide",
  "faq",
  "quiz",
  "flashcards",
  "mindmap",
  "timeline",
  "slides",
  "infographic",
]);

const MAX_TOPIC_CHARS = 2000;

type Saved = {
  topic?: string;
  length?: StudyLength;
  difficulty?: StudyDifficulty;
  theme?: string;
  style?: string;
  orientation?: string;
  detail?: string;
  instructions?: string;
  title?: string;
};

type Stored = { request?: Saved; sourceIds?: string[]; difficulty?: StudyDifficulty; style?: string; orientation?: string; detail?: string };

const jobId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Redo a generated item with a changed focus or options. The original is kept
 * (the new version is added to the Library) unless "Replace" is chosen, and a
 * replaced original is only deleted once the new one has been saved.
 */
export default function RegenerateDialog({
  artifact,
  onClose,
  onDone,
}: {
  artifact: Artifact;
  onClose: () => void;
  onDone: (made: Artifact) => void | Promise<void>;
}) {
  const type = artifact.type as ArtifactType;
  const spec = STUDIO[type];
  const stored = artifact.content as unknown as Stored;
  const saved: Saved = { difficulty: stored.difficulty, style: stored.style, orientation: stored.orientation, detail: stored.detail, ...stored.request };
  const sourceIds = [...new Set(stored.sourceIds ?? [])];

  const [topic, setTopic] = useState(saved.topic ?? "");
  const [length, setLength] = useState<StudyLength>(saved.length ?? "standard");
  const [difficulty, setDifficulty] = useState<StudyDifficulty>(saved.difficulty ?? "medium");
  const [theme, setTheme] = useState(saved.theme ?? DEFAULT_SLIDE_THEME);
  const [style, setStyle] = useState(knownStyle(saved.style) ?? "classic");
  const [instructions, setInstructions] = useState(saved.instructions ?? "");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateReply | null>(null);
  const abort = useRef<AbortController | null>(null);
  const job = useRef<string | null>(null);
  const ids = { topic: useId(), length: useId(), difficulty: useId(), theme: useId(), style: useId(), instructions: useId() };

  const { dialogRef, backdropProps } = useDialog(() => {
    if (!busy) onClose();
  });

  const body = (): Record<string, unknown> => ({
    notebookId: artifact.notebookId,
    type,
    topic: topic.trim() || undefined,
    sourceIds,
    basedOn: artifact.id,
    replace,
    ...(spec.study || spec.sized || type === "slides" ? { length } : {}),
    ...(spec.study ? { difficulty } : {}),
    ...(type === "slides" ? { theme } : {}),
    ...(type === "infographic"
      ? {
          style,
          orientation: saved.orientation,
          detail: saved.detail,
          instructions: instructions.trim() || undefined,
          title: saved.title,
        }
      : {}),
  });

  // The estimate follows the options, a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(() => void fetchEstimate(type, body()).then(setEstimate), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, length, difficulty, theme, style, instructions, topic, replace]);

  const cancel = () => {
    abort.current?.abort();
    const id = job.current;
    if (id) void fetch(`/api/jobs/${id}/cancel`, { method: "POST" }).catch(() => {});
    setStatus("Cancelling…");
  };

  const start = async () => {
    if (sourceIds.length === 0) {
      setError("This item has no record of the sources it was made from, so it cannot be redone here. Generate a new one from Studio instead.");
      return;
    }
    setError(null);
    setBusy(true);
    setStatus("Starting");
    const controller = new AbortController();
    abort.current = controller;
    job.current = jobId();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson", "x-job-id": job.current },
        body: JSON.stringify(body()),
        signal: controller.signal,
      });
      const made = await readJSONReply<Artifact & { error?: string }>(res, "Could not regenerate this item.", setStatus);
      await onDone({ ...made, notebookId: artifact.notebookId });
    } catch (e) {
      const cancelled = controller.signal.aborted || (e instanceof JSONReplyError && e.code === "cancelled");
      setError(cancelled ? "Cancelled. Nothing was changed." : e instanceof Error ? e.message : "Could not regenerate this item.");
    } finally {
      setBusy(false);
      abort.current = null;
      job.current = null;
    }
  };

  const blocked = estimate && !estimate.fits;
  const field = "input mt-1 w-full !py-1.5 text-[13px]";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="regen-title"
        className="fade-up card flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden !p-0 outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id="regen-title" className="flex-1 truncate text-[15px] font-semibold">
            Regenerate {studioLabel(type)}
          </h2>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </header>
        <form
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void start();
          }}
        >
          <p className="text-[var(--muted)]">
            Makes a new version from the {sourceIds.length} source{sourceIds.length === 1 ? "" : "s"} “{artifact.title}” was made from. Change anything below first.
          </p>
          <div>
            <label htmlFor={ids.topic} className="font-medium">
              Focus or instruction
            </label>
            <textarea
              id={ids.topic}
              className={`${field} min-h-[4.5rem]`}
              value={topic}
              maxLength={MAX_TOPIC_CHARS}
              placeholder="e.g. 'focus on funding risks' or 'for new volunteers' (optional)"
              onChange={(e) => setTopic(e.target.value)}
              disabled={busy}
            />
          </div>
          {(spec.study || spec.sized || type === "slides") && (
            <div>
              <label htmlFor={ids.length} className="font-medium">
                Length
              </label>
              <select id={ids.length} className={field} value={length} onChange={(e) => setLength(e.target.value as StudyLength)} disabled={busy}>
                <option value="short">Short</option>
                <option value="standard">Standard</option>
                <option value="long">Long</option>
              </select>
            </div>
          )}
          {spec.study && (
            <div>
              <label htmlFor={ids.difficulty} className="font-medium">
                Difficulty
              </label>
              <select id={ids.difficulty} className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value as StudyDifficulty)} disabled={busy}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          )}
          {type === "slides" && (
            <div>
              <label htmlFor={ids.theme} className="font-medium">
                Theme
              </label>
              <select id={ids.theme} className={field} value={theme} onChange={(e) => setTheme(e.target.value)} disabled={busy}>
                {Object.entries(SLIDE_THEMES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {type === "infographic" && (
            <>
              <div>
                <label htmlFor={ids.style} className="font-medium">
                  Style
                </label>
                <select id={ids.style} className={field} value={style} onChange={(e) => setStyle(e.target.value as typeof style)} disabled={busy}>
                  {Object.entries(INFOGRAPHIC_STYLES).map(([key, s]) => (
                    <option key={key} value={key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={ids.instructions} className="font-medium">
                  Extra instructions
                </label>
                <textarea
                  id={ids.instructions}
                  className={`${field} min-h-[4.5rem]`}
                  value={instructions}
                  maxLength={MAX_INFOGRAPHIC_INSTRUCTIONS}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={busy}
                />
              </div>
            </>
          )}

          <fieldset disabled={busy}>
            <legend className="font-medium">What happens to the current version</legend>
            <label className="mt-1.5 flex items-start gap-2">
              <input type="radio" name="regen-keep" className="mt-1" checked={!replace} onChange={() => setReplace(false)} />
              <span>
                <strong className="font-medium">Keep it.</strong> The new version is added to the Library next to it.
              </span>
            </label>
            <label className="mt-1.5 flex items-start gap-2">
              <input type="radio" name="regen-keep" className="mt-1" checked={replace} onChange={() => setReplace(true)} />
              <span>
                <strong className="font-medium">Replace it.</strong> The current version is deleted once the new one is saved. This cannot be undone.
              </span>
            </label>
          </fieldset>

          {estimate && <p className="text-[11px] text-[var(--muted)]">{estimateNote(estimate)}</p>}
          {blocked && estimate?.message && <p role="alert" className="text-xs text-red-300">{estimate.message}</p>}
          {busy && (
            <p role="status" className="flex items-center gap-2 text-[var(--muted)]">
              <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] motion-safe:animate-spin" />
              {status}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-red-300">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {busy ? (
              <button type="button" className="btn" onClick={cancel}>
                Cancel generation
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={onClose}>
                  Close
                </button>
                <button type="submit" className="btn btn-primary" disabled={Boolean(blocked)}>
                  {replace ? "Regenerate and replace" : "Regenerate as a new version"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
