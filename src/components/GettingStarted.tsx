"use client";

import { useState, type CSSProperties } from "react";

/**
 * The notebook's core loop, shown where a new user lands: add sources, pick
 * which to use, then ask or create. It is a three-step stepper: the rail shows
 * where you are and what is already done, and you can move forward or back at
 * any time (Back and Next, or the rail itself) if you change your mind. Each
 * step reflects the notebook's state, so it doubles as a checklist and as the
 * reason chat or Studio is still locked. Real progress (adding the first
 * source, ticking one) moves the stepper on by itself; navigating by hand
 * holds until the notebook's state next changes.
 */

type Action = { label: string; onClick?: () => void; opensSources?: boolean };

type Step = {
  id: string;
  label: string;
  title: string;
  body: string;
  status: string;
  done: boolean;
  note?: string;
  actions: Action[];
};

export default function GettingStarted({
  sourceCount,
  selectedCount,
  onAddSources,
  onChooseSources,
  onUseAll,
  onOpenStudio,
}: {
  sourceCount: number;
  selectedCount: number;
  onAddSources?: () => void;
  onChooseSources?: () => void;
  onUseAll?: () => void;
  onOpenStudio?: () => void;
}) {
  const hasSources = sourceCount > 0;
  const hasSelection = selectedCount > 0;
  const steps: Step[] = [
    {
      id: "add",
      label: "Add sources",
      title: "Add sources",
      body: "Upload files, add a link, paste text, or search the web.",
      status: hasSources ? `${sourceCount} added` : "None yet",
      done: hasSources,
      actions: [
        {
          label: hasSources ? "Add more sources" : "Add sources",
          onClick: onAddSources,
          opensSources: true,
        },
      ],
    },
    {
      id: "choose",
      label: "Choose sources",
      title: "Choose which sources to use",
      body: "Ticked sources are the only ones Chat and Studio draw on.",
      status: hasSources ? `${selectedCount} of ${sourceCount} in use` : "After adding",
      done: hasSelection,
      note: hasSources ? undefined : "Add a source first, then come back to choose.",
      actions: hasSources
        ? [
            ...(selectedCount < sourceCount
              ? [{ label: "Use all sources", onClick: onUseAll }]
              : []),
            { label: "Choose in Sources", onClick: onChooseSources, opensSources: true },
          ]
        : [],
    },
    {
      id: "studio",
      label: "Open Studio",
      title: "Ask or create",
      body: "Ask a question below for a cited answer, or use Studio to make reports, audio, video, infographics and quizzes.",
      status: hasSelection ? "Ready" : "After choosing",
      done: false,
      note: hasSelection ? undefined : "Choose at least one source to unlock Chat and Studio.",
      actions: hasSelection ? [{ label: "Open Studio", onClick: onOpenStudio }] : [],
    },
  ];

  // The first unfinished step. Moving by hand is remembered against the step it
  // started from, so real progress (which changes this) hands control back.
  const current = steps.findIndex((s) => !s.done);
  const [nav, setNav] = useState<{ from: number; to: number; dir: 1 | -1 } | null>(null);
  const navigated = nav !== null && nav.from === current;
  const view = navigated ? nav.to : current;
  const dir = navigated ? nav.dir : 1;
  const step = steps[view];

  const go = (to: number) => {
    if (to < 0 || to >= steps.length || to === view) return;
    setNav({ from: current, to, dir: to > view ? 1 : -1 });
  };
  // Steps one and two both live in the Sources panel, so moving between them
  // must not collapse it the way a click elsewhere does.
  const keepSources = (to: number) => (to <= 1 ? "" : undefined);
  const actions = step.actions.filter((a) => a.onClick);

  return (
    <div className="mx-auto w-full max-w-md text-left">
      <ol aria-label="Getting started" className="grid grid-cols-3">
        {steps.map((s, i) => {
          const isView = i === view;
          return (
            <li key={s.id} className="relative flex flex-col items-stretch">
              {i > 0 && (
                <span aria-hidden className="step-link" data-filled={view >= i ? "true" : "false"}>
                  <span className="step-link-fill" />
                </span>
              )}
              <button
                type="button"
                aria-current={isView ? "step" : undefined}
                data-keeps-sources-open={keepSources(i)}
                className="group flex flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-center transition-colors hover:bg-hover"
                onClick={() => go(i)}
              >
                <span
                  aria-hidden
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] bg-[var(--panel)] text-[11px] font-semibold tabular-nums transition-colors duration-200 ${
                    isView
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--panel))]"
                      : s.done
                        ? "border-emerald-700/60"
                        : "border-[var(--border-strong)] group-hover:border-[var(--border-hover)]"
                  } ${
                    s.done ? "text-emerald-300" : isView ? "text-[var(--fg)]" : "text-[var(--muted)]"
                  }`}
                >
                  {isView && <span className="step-ping" />}
                  <span
                    key={`${isView}-${s.done}`}
                    className={`flex items-center justify-center ${isView || s.done ? "step-pop" : ""}`}
                    style={{ "--step-i": i } as CSSProperties}
                  >
                    {s.done ? (
                      <svg viewBox="0 0 16 16" width="13" height="13" fill="none" className="step-check">
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          pathLength={1}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                </span>
                <span
                  className={`text-[13px] leading-tight font-medium ${
                    isView || s.done ? "text-[var(--fg)]" : "text-[var(--muted)]"
                  }`}
                >
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.label}
                  {s.done && <span className="sr-only"> (done)</span>}
                </span>
                <span className="text-[11px] leading-tight text-[var(--muted)]">{s.status}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="sr-only" aria-live="polite">
        Step {view + 1} of {steps.length}: {step.title}
      </p>
      <div
        key={view}
        role="group"
        aria-label={`Step ${view + 1} of ${steps.length}: ${step.title}`}
        className="step-card mt-4 rounded-xl border border-line-strong bg-panel2 px-4 py-3.5"
        style={{ "--step-dir": dir } as CSSProperties}
      >
        <p className="text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
          Step {view + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-[13px] font-medium">{step.title}</h3>
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{step.body}</p>
        {step.note && <p className="mt-2 text-[11px] leading-snug text-[var(--fg)]">{step.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn !px-2.5 !py-1 !text-[11px]"
            disabled={view === 0}
            aria-label={view > 0 ? `Back to ${steps[view - 1].label}` : "Back"}
            data-keeps-sources-open={keepSources(view - 1)}
            onClick={() => go(view - 1)}
          >
            <span aria-hidden>←</span> Back
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {actions.map((a, ai) => (
              <button
                key={a.label}
                type="button"
                aria-controls={a.opensSources ? "sources-panel" : undefined}
                className={`btn !px-2.5 !py-1 !text-[11px] ${!step.done && ai === 0 ? "btn-primary" : ""}`}
                onClick={a.onClick}
              >
                {a.label}
              </button>
            ))}
            {view < steps.length - 1 && (
              <button
                type="button"
                className={`btn !px-2.5 !py-1 !text-[11px] ${step.done ? "btn-primary" : ""}`}
                aria-label={`Next: ${steps[view + 1].label}`}
                data-keeps-sources-open={keepSources(view + 1)}
                onClick={() => go(view + 1)}
              >
                Next <span aria-hidden>→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
