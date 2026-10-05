"use client";

import type { PanelSide } from "@/lib/panelLayout";

/** A pushpin: filled and upright when pinned, an outline tilted aside when not. */
function PinIcon({ pinned }: { pinned: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      className={pinned ? "" : "rotate-45"}
      fill={pinned ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M5.5 1.75h5l-.75 4 2.5 2.5v1.25h-8.5V8.25l2.5-2.5z" />
      <path d="M8 9.5v4.75" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Pin and collapse buttons for a side panel's header. Shown on wide screens
 * only; narrow screens switch panels with the tab bar instead.
 */
export function PanelControls({
  name,
  side,
  pinned,
  onTogglePin,
  onCollapse,
}: {
  name: string;
  side: PanelSide;
  pinned: boolean;
  onTogglePin: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="hidden shrink-0 items-center gap-0.5 lg:flex" data-tour={`${side}-controls`}>
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={`Pin ${name} panel`}
        title={
          pinned
            ? `Pinned: ${name} stays open beside the chat. Click to let it float and fold away when you click elsewhere.`
            : `Pin ${name} open beside the chat`
        }
        onClick={onTogglePin}
        className={`flex h-6 w-6 items-center justify-center rounded-md transition ${
          pinned
            ? "bg-hover text-[var(--fg)]"
            : "text-[var(--muted)] hover:bg-hover hover:text-[var(--fg)]"
        }`}
      >
        <PinIcon pinned={pinned} />
      </button>
      <button
        type="button"
        aria-label={`Collapse ${name} panel`}
        title={`Collapse ${name} to a slim rail`}
        onClick={onCollapse}
        className="flex h-6 w-6 items-center justify-center rounded-md text-[13px] text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
      >
        <span aria-hidden>{side === "left" ? "«" : "»"}</span>
      </button>
    </div>
  );
}

export type RailItem = {
  label: string;
  icon: string;
  count?: number;
  onClick: () => void;
};

/**
 * What a collapsed or floating panel leaves in its column: a button to bring
 * it back, plus one labelled button per view it holds.
 */
export function PanelRail({
  side,
  name,
  items,
  onExpand,
}: {
  side: PanelSide;
  name: string;
  items: RailItem[];
  onExpand: () => void;
}) {
  return (
    <nav
      aria-label={`${name} panel (collapsed)`}
      className="hidden h-full flex-col items-center gap-1 bg-[var(--panel)] py-2 lg:flex"
    >
      <button
        type="button"
        id={`rail-${side}`}
        aria-label={`Expand ${name} panel`}
        title={`Expand ${name}`}
        onClick={onExpand}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
      >
        <span aria-hidden>{side === "left" ? "»" : "«"}</span>
      </button>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          aria-label={`Open ${item.label}${item.count ? ` (${item.count})` : ""}`}
          title={`Open ${item.label}`}
          className="flex w-9 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
        >
          <span aria-hidden className="text-base leading-none">
            {item.icon}
          </span>
          <span
            aria-hidden
            className="text-[11px] font-medium tracking-wide [writing-mode:vertical-rl]"
          >
            {item.label}
            {item.count ? ` · ${item.count}` : ""}
          </span>
        </button>
      ))}
    </nav>
  );
}
