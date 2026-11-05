"use client";

import type { Citation } from "@/lib/types";
import { normalizeLearnUrl } from "@/lib/learnurl";
import { useDialog } from "./useDialog";

export default function LearnCitationModal({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const { dialogRef, backdropProps } = useDialog(onClose);
  let url: string | null = null;
  try {
    url = normalizeLearnUrl(citation.url ?? "");
  } catch {
    // Imported notebooks may contain untrusted citation URLs.
  }
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6" {...backdropProps}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="learn-citation-title"
        className="fade-up flex max-h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:max-h-[80vh] sm:rounded-2xl">
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="learn-citation-title" className="text-[15px] font-semibold">Microsoft Learn citation</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{citation.sourceTitle}</p>
          </div>
          <button type="button" className="btn !px-2.5 !py-1.5 !text-xs" aria-label="Close" onClick={onClose}>Close</button>
        </header>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-[var(--muted)]">
            This excerpt was saved with the answer. The current documentation may have changed.
            It is not a saved notebook source.
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{citation.content || citation.snippet}</p>
        </div>
        <footer className="border-t border-[var(--border)] px-5 py-3">
          {url ? (
            <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Open original on Microsoft Learn</a>
          ) : (
            <p role="alert" className="text-sm text-[var(--muted)]">The saved citation does not contain a valid Microsoft Learn documentation link.</p>
          )}
        </footer>
      </div>
    </div>
  );
}
