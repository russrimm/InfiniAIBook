"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A Studio generator with settings. Generating is an explicit button, never
 * the title, and settings stay folded behind "Options" with a one-line summary
 * so the panel reads as a list of formats rather than a wall of controls.
 */
export default function StudioCard({
  icon,
  label,
  status,
  summary,
  busy,
  blocked,
  error,
  onGenerate,
  options,
  children,
  testId,
}: {
  icon: ReactNode;
  label: string;
  /** The blurb, or what the job is doing while it runs. */
  status: ReactNode;
  /** The current settings in a few words, shown while Options is closed. */
  summary?: ReactNode;
  busy: boolean;
  blocked: boolean;
  error?: string;
  onGenerate: () => void;
  /** Settings revealed by the Options toggle. */
  options?: ReactNode;
  /** Always-visible content between the header and Options. */
  children?: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div
      data-testid={testId}
      className={`card relative overflow-hidden transition ${
        busy ? "shimmer border-[var(--accent)]" : ""
      }`}
    >
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <span aria-hidden className="text-xl">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-medium">{label}</h4>
          <p className="text-[10px] leading-snug text-[var(--muted)]">{status}</p>
        </div>
        <button
          type="button"
          className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
          disabled={blocked || busy}
          onClick={onGenerate}
          aria-label={`Generate ${label}`}
        >
          {busy ? "Working…" : "Generate"}
        </button>
      </div>

      {children}

      {options && (
        <>
          <div className="border-t border-[var(--border)] px-3 py-1.5">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              onClick={() => setOpen((v) => !v)}
              className="flex w-full min-w-0 items-center gap-1.5 text-left text-[10px] text-[var(--muted)] transition hover:text-[var(--fg)]"
            >
              <span aria-hidden>{open ? "▾" : "▸"}</span>
              <span className="shrink-0 tracking-wide uppercase">Options</span>
              {!open && summary && (
                <span className="min-w-0 flex-1 truncate normal-case">· {summary}</span>
              )}
            </button>
          </div>
          {open && (
            <div
              id={panelId}
              className="fade-up space-y-2 border-t border-[var(--border)] px-3 py-2"
            >
              {options}
            </div>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          className="border-t border-red-900/50 bg-red-950/20 px-3 py-2 text-[11px] leading-snug text-red-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
