"use client";

import { useId, type ReactNode } from "react";

/**
 * One category in Studio: a heading that folds its cards away, with a
 * one-line description. The folded content stays mounted (hidden), so a
 * card's open options and edits survive collapsing and filtering.
 */
export default function StudioGroup({
  id,
  label,
  blurb,
  count,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  blurb: string;
  /** How many formats the group shows right now. */
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <section aria-labelledby={`studio-${id}`} className="mt-4 first:mt-0" data-testid={`studio-group-${id}`}>
      <h3 id={`studio-${id}`} className="text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="-mx-1 flex min-h-8 w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 text-left uppercase transition hover:text-[var(--fg)]"
        >
          <span aria-hidden>{expanded ? "▾" : "▸"}</span>
          <span>{label}</span>
          <span className="font-normal tracking-normal normal-case">
            <span aria-hidden>· {count}</span>
            <span className="sr-only">, {count} {count === 1 ? "format" : "formats"}</span>
          </span>
        </button>
      </h3>
      <p className="mb-2 text-[10px] leading-snug text-[var(--muted)]">{blurb}</p>
      <div id={panelId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
