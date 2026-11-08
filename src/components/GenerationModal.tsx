"use client";

import { useId } from "react";
import { useDialog } from "./useDialog";

export type GenerationJob = {
  id: string;
  label: string;
  status: string;
  error?: string;
  detail?: string;
  progress?: { done: number; total: number; label: string };
};

export default function GenerationModal({
  jobs,
  onClose,
  title = "Generation status",
}: {
  jobs: GenerationJob[];
  onClose: () => void;
  title?: string;
}) {
  const titleId = useId();
  const { dialogRef, backdropProps } = useDialog(onClose);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/65 backdrop-blur-sm sm:items-center sm:p-6"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fade-up flex w-full max-w-lg flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:max-h-full sm:rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 id={titleId} className="flex-1 text-[15px] font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="btn !px-2.5 !py-1.5 !text-xs"
            aria-label="Close generation status"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <ul className="min-h-0 space-y-3 overflow-y-auto px-5 py-5">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-xl border border-[var(--border)] bg-well px-4 py-3">
              <h3 className="text-[13px] font-medium">{job.label}</h3>
              {job.error ? (
                <p role="alert" className="mt-2 text-[13px] text-red-300">
                  {job.error}
                </p>
              ) : (
                <p role="status" aria-atomic="true" className="mt-2 flex items-center gap-2 text-[13px] text-[var(--muted)]">
                  <span
                    aria-hidden
                    className="h-4 w-4 shrink-0 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] motion-safe:animate-spin"
                  />
                  {job.status}
                </p>
              )}
              {job.progress && job.progress.total > 0 && (
                <div className="mt-3 flex items-center gap-3">
                  <div
                    role="progressbar"
                    aria-label={job.progress.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(Math.min(100, Math.max(0, job.progress.done / job.progress.total * 100)))}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-track-soft"
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all motion-reduce:transition-none"
                      style={{ width: `${Math.min(100, Math.max(0, job.progress.done / job.progress.total * 100))}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--muted)]">
                    {job.progress.done}/{job.progress.total}
                  </span>
                </div>
              )}
              {job.detail && (
                <p className="mt-2 text-[11px] text-[var(--muted)]">{job.detail}</p>
              )}
            </li>
          ))}
        </ul>
        <footer className="border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--muted)]">
          Closing this status view does not cancel generation.
        </footer>
      </div>
    </div>
  );
}
