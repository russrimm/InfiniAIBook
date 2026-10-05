"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useDialog } from "./useDialog";
import { ARROW_SIZE, placeTourCard, type Box, type Placement } from "@/lib/tourPlacement";

export type TourStep = {
  /** Matches a `data-tour` attribute on the element to point at. */
  target: string;
  placement: Placement;
  title: string;
  body: string;
};

const SPOT_PAD = 6;

function measure(target: string): Box | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  const r = el?.getBoundingClientRect();
  if (!r || r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * A step-by-step walkthrough: each step dims the page, lights up one control,
 * points an arrow at it and explains it, with Back, Next and Finish. A step
 * whose control is not on screen shows its card in the middle instead.
 */
export default function GuidedTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  /** `finished` is true for Finish, false for Skip, Escape or a click outside. */
  onClose: (finished: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const { dialogRef, backdropProps } = useDialog(() => onClose(false));
  const [target, setTarget] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState({ width: 320, height: 200 });
  const [view, setView] = useState({ width: 1280, height: 800 });

  // Follow the target as the window resizes or panels open and close.
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      setTarget(measure(step.target));
      setView({ width: window.innerWidth, height: window.innerHeight });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer.disconnect();
    };
  }, [step.target]);

  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const { offsetWidth: width, offsetHeight: height } = el;
    setCardSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, [dialogRef, index]);

  // Move focus to the step's main button so Enter keeps going.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>("[data-tour-next]")?.focus();
  }, [dialogRef, index]);

  const next = () => (last ? onClose(true) : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const placed = target ? placeTourCard(target, cardSize, view, step.placement) : null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        aria-hidden
        className={`absolute inset-0 ${placed ? "" : "bg-black/60"}`}
        {...backdropProps}
      />
      {target && (
        <div
          aria-hidden
          data-testid="tour-spotlight"
          className="pointer-events-none fixed rounded-xl border-2 border-[var(--accent)] transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={{
            top: target.top - SPOT_PAD,
            left: target.left - SPOT_PAD,
            width: target.width + SPOT_PAD * 2,
            height: target.height + SPOT_PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
          }}
        />
      )}
      {placed && (
        <div
          aria-hidden
          data-testid="tour-arrow"
          className="pointer-events-none fixed text-[var(--accent)]"
          style={{
            top: placed.arrow.top,
            left: placed.arrow.left,
            width: ARROW_SIZE,
            height: ARROW_SIZE,
            transform: `rotate(${placed.arrow.rotate}deg)`,
          }}
        >
          <svg viewBox="0 0 32 32" width={ARROW_SIZE} height={ARROW_SIZE} className="tour-nudge">
            <path
              d="M29 16H5M14 6.5 4.5 16l9.5 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={(e) => {
          if (e.target instanceof HTMLButtonElement) return;
          if (e.key === "ArrowRight") next();
          if (e.key === "ArrowLeft") back();
        }}
        className="card fixed w-[320px] max-w-[calc(100vw-24px)] p-4 shadow-2xl outline-none"
        style={
          placed
            ? { top: placed.card.top, left: placed.card.left }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <div key={index} className="fade-up" aria-live="polite">
          <p className="text-[10px] font-semibold tracking-widest text-[var(--muted)] uppercase">
            Step {index + 1} of {steps.length}
          </p>
          <h2 id="tour-title" className="mt-1 text-[15px] font-semibold text-heading">
            {step.title}
          </h2>
          <p id="tour-body" className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            {step.body}
          </p>
        </div>
        <div aria-hidden className="mt-3 flex gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.target}
              className={`h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none ${
                i === index ? "w-4 bg-[var(--accent)]" : "w-1.5 bg-line-strong"
              }`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button
              type="button"
              className="mr-auto rounded-md px-1.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--fg)]"
              onClick={() => onClose(false)}
            >
              Skip tour
            </button>
          )}
          {index > 0 && (
            <button type="button" className={`btn !px-3 !py-1 !text-[11px] ${last ? "ml-auto" : ""}`} onClick={back}>
              Back
            </button>
          )}
          <button
            key={index}
            type="button"
            data-tour-next
            className={`btn btn-primary !px-3 !py-1 !text-[11px] ${last && index === 0 ? "ml-auto" : ""}`}
            onClick={next}
          >
            {last ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
