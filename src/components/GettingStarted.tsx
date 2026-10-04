"use client";

/**
 * The notebook's core loop, shown where a new user lands: add sources, pick
 * which to use, then ask or create. Each step reflects the notebook's state, so
 * it doubles as a checklist and as the reason chat or Studio is still locked.
 */
export default function GettingStarted({
  sourceCount,
  selectedCount,
  onAddSources,
  onUseAll,
  onOpenStudio,
}: {
  sourceCount: number;
  selectedCount: number;
  onAddSources?: () => void;
  onUseAll?: () => void;
  onOpenStudio?: () => void;
}) {
  const hasSources = sourceCount > 0;
  const hasSelection = selectedCount > 0;
  const steps: {
    title: string;
    body: string;
    done: boolean;
    action?: { label: string; onClick?: () => void };
  }[] = [
    {
      title: "Add sources",
      body: "Upload files, add a link, paste text, or search the web.",
      done: hasSources,
      action: hasSources ? undefined : { label: "Add sources", onClick: onAddSources },
    },
    {
      title: "Choose which sources to use",
      body: "Ticked sources are the only ones Chat and Studio draw on.",
      done: hasSelection,
      action:
        hasSources && !hasSelection ? { label: "Use all sources", onClick: onUseAll } : undefined,
    },
    {
      title: "Ask or create",
      body: "Ask a question below for a cited answer, or use Studio to make reports, audio, video, infographics and quizzes.",
      done: false,
      action: hasSelection ? { label: "Open Studio", onClick: onOpenStudio } : undefined,
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol aria-label="Getting started" className="mx-auto max-w-md space-y-2 text-left">
      {steps.map((step, i) => {
        const isCurrent = i === current;
        return (
          <li
            key={step.title}
            aria-current={isCurrent ? "step" : undefined}
            className={`flex gap-3 rounded-xl border px-3 py-2.5 ${
              isCurrent ? "border-line-strong bg-panel2" : "border-[var(--border)]"
            } ${!step.done && !isCurrent ? "opacity-60" : ""}`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
                step.done
                  ? "border-emerald-700/60 text-emerald-300"
                  : isCurrent
                    ? "border-[var(--accent)] text-[var(--fg)]"
                    : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {step.title}
                {step.done && <span className="sr-only"> (done)</span>}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{step.body}</p>
            </div>
            {step.action?.onClick && (
              <button
                type="button"
                className={`btn h-fit shrink-0 self-center !px-2.5 !py-1 !text-[11px] ${
                  isCurrent && i < 2 ? "btn-primary" : ""
                }`}
                onClick={step.action.onClick}
              >
                {step.action.label}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}
