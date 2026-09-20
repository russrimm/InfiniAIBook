"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineCited } from "./Markdown";
import type { Citation, FlashcardsContent } from "@/lib/types";

type Mark = "got" | "missed";

/**
 * Study progress is per-person and disposable, so it lives in localStorage
 * rather than the artifact: re-running a deck should not rewrite the generated
 * content, and a half-finished session is not worth a database round trip.
 */
const keyFor = (id: string) => `onb:flashcards:${id}`;

/** A citation marker on the prompt side would give the answer away. */
const stripMarkers = (s: string) => s.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "").trim();

export default function Flashcards({
  artifactId,
  content,
  citations,
}: {
  artifactId: string;
  content: FlashcardsContent;
  citations?: Citation[];
}) {
  // A bare `?? []` fallback would be a fresh array each render, which makes
  // every memo and effect keyed on it re-run.
  const cards = useMemo(() => content.cards ?? [], [content.cards]);
  const total = cards.length;

  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [browsing, setBrowsing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Restore before the first paint that matters, but only on the client.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(keyFor(artifactId));
      if (raw) {
        const saved = JSON.parse(raw) as { marks?: Record<number, Mark> };
        if (saved.marks) setMarks(saved.marks);
      }
    } catch {
      /* corrupt or unavailable storage just means a fresh session */
    }
    setLoaded(true);
  }, [artifactId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(keyFor(artifactId), JSON.stringify({ marks }));
    } catch {
      /* private mode or quota — progress is simply not kept */
    }
  }, [artifactId, marks, loaded]);

  const cardIndex = order[pos];
  const card = cards[cardIndex];
  const graded = Object.keys(marks).length;
  const gotCount = Object.values(marks).filter((m) => m === "got").length;
  const missedIdx = useMemo(
    () => cards.map((_, i) => i).filter((i) => marks[i] === "missed"),
    [cards, marks]
  );
  const done = pos >= order.length;

  const mark = useCallback(
    (m: Mark) => {
      setMarks((prev) => ({ ...prev, [cardIndex]: m }));
      setFlipped(false);
      setPos((p) => p + 1);
    },
    [cardIndex]
  );

  const restart = (subset?: number[], shuffle = false) => {
    const next = subset?.length ? [...subset] : cards.map((_, i) => i);
    if (shuffle) {
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
    }
    setOrder(next);
    setPos(0);
    setFlipped(false);
    if (!subset?.length) setMarks({});
  };

  useEffect(() => {
    if (browsing || done) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && (e.key === "1" || e.key.toLowerCase() === "j")) {
        mark("missed");
      } else if (flipped && (e.key === "2" || e.key.toLowerCase() === "k")) {
        mark("got");
      } else if (e.key === "ArrowLeft" && pos > 0) {
        setFlipped(false);
        setPos((p) => p - 1);
      } else if (e.key === "ArrowRight") {
        setFlipped(false);
        setPos((p) => Math.min(p + 1, order.length));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [browsing, done, flipped, mark, order.length, pos]);

  if (!total) {
    return (
      <p className="text-sm text-[var(--muted)]">This deck has no cards.</p>
    );
  }

  if (browsing) {
    return (
      <div>
        <Toolbar
          browsing
          onToggle={() => setBrowsing(false)}
          onShuffle={() => restart(undefined, true)}
          total={total}
          graded={graded}
        />
        <ol className="space-y-2">
          {cards.map((c, i) => (
            <li
              key={i}
              className="rounded-xl border border-[var(--border)] px-4 py-3"
              style={{
                borderColor:
                  marks[i] === "got"
                    ? "rgb(16 185 129 / 0.45)"
                    : marks[i] === "missed"
                      ? "rgb(239 68 68 / 0.45)"
                      : undefined,
              }}
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{stripMarkers(c.front)}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#c9d2dd]">
                    <InlineCited text={c.back} citations={citations} />
                  </p>
                </div>
                {marks[i] && (
                  <span
                    className={`shrink-0 text-xs ${
                      marks[i] === "got" ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {marks[i] === "got" ? "✓" : "✕"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  if (done) {
    const reviewed = order.length;
    const correct = order.filter((i) => marks[i] === "got").length;
    return (
      <div className="fade-up flex min-h-full flex-col">
        <Toolbar
          onToggle={() => setBrowsing(true)}
          onShuffle={() => restart(undefined, true)}
          total={total}
          graded={graded}
        />
        <div className="flex flex-1 items-center justify-center pb-4">
          <div className="w-full rounded-2xl border border-[var(--border)] bg-[#0e1116] p-8 text-center">
            <div className="text-4xl font-semibold">
              {correct}
              <span className="text-[var(--muted)]">/{reviewed}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {correct === reviewed
                ? "Whole deck recalled. Nothing left to drill."
                : `${reviewed - correct} card${reviewed - correct === 1 ? "" : "s"} to revisit.`}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {missedIdx.length > 0 && (
                <button
                  className="btn btn-primary !py-1.5 !text-xs"
                  onClick={() => restart(missedIdx, true)}
                >
                  Review {missedIdx.length} missed
                </button>
              )}
              <button
                className="btn !py-1.5 !text-xs"
                onClick={() => restart(undefined, true)}
              >
                Shuffle and restart
              </button>
              <button className="btn !py-1.5 !text-xs" onClick={() => restart()}>
                Start over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <Toolbar
        onToggle={() => setBrowsing(true)}
        onShuffle={() => restart(undefined, true)}
        total={total}
        graded={graded}
      />

      <div className="mb-3 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#1b2027]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
            style={{ width: `${(pos / order.length) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-[var(--muted)]">
          {pos + 1} / {order.length}
        </span>
      </div>

      {/* The card is the whole point of this view, so it takes the room the
          modal gives it rather than sitting in a band at the top. */}
      <div className="flex flex-1 flex-col justify-center pb-4">
        <button
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Show prompt" : "Reveal answer"}
          className="group relative flex min-h-[16rem] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[#0e1116] px-6 py-12 text-center transition hover:border-[#39424f] sm:min-h-[22rem]"
        >
          <span className="absolute top-3 left-4 text-[10px] tracking-wide text-[var(--muted)] uppercase">
            {flipped ? "Answer" : "Prompt"}
          </span>

          {flipped ? (
            <p className="fade-up mx-auto max-w-xl text-[16px] leading-relaxed text-[#dbe3ee] sm:text-[17px]">
              <InlineCited text={card.back} citations={citations} />
            </p>
          ) : (
            <>
              <p className="mx-auto max-w-xl text-[20px] leading-snug font-medium sm:text-[24px]">
                {stripMarkers(card.front)}
              </p>
              {card.hint && (
                <p className="mx-auto mt-3 max-w-md text-[12px] text-[var(--muted)]">
                  Hint: {card.hint}
                </p>
              )}
            </>
          )}

          <span className="absolute inset-x-0 bottom-3 text-[10px] text-[var(--muted)] opacity-0 transition group-hover:opacity-100">
            {flipped ? "Click to hide" : "Click or press Space to reveal"}
          </span>
        </button>

        {flipped ? (
          <div className="fade-up mt-4 flex gap-2">
            <button
              className="btn flex-1 !py-2 !text-xs hover:!border-red-500/60"
              onClick={() => mark("missed")}
            >
              ✕ Missed it
            </button>
            <button
              className="btn flex-1 !py-2 !text-xs hover:!border-emerald-500/60"
              onClick={() => mark("got")}
            >
              ✓ Got it
            </button>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between">
            <button
              className="btn !py-1.5 !text-xs disabled:opacity-40"
              disabled={pos === 0}
              onClick={() => {
                setFlipped(false);
                setPos((p) => p - 1);
              }}
            >
              ← Previous
            </button>
            <span className="text-[11px] text-[var(--muted)]">
              {gotCount} known · {missedIdx.length} to review
            </span>
            <button
              className="btn !py-1.5 !text-xs"
              onClick={() => {
                setFlipped(false);
                setPos((p) => p + 1);
              }}
            >
              Skip →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Toolbar({
  browsing,
  onToggle,
  onShuffle,
  total,
  graded,
}: {
  browsing?: boolean;
  onToggle: () => void;
  onShuffle: () => void;
  total: number;
  graded: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-[11px] text-[var(--muted)]">
        {total} cards{graded > 0 && ` · ${graded} graded`}
      </span>
      <div className="ml-auto flex gap-2">
        <button className="btn !px-2.5 !py-1 !text-[11px]" onClick={onShuffle}>
          Shuffle
        </button>
        <button className="btn !px-2.5 !py-1 !text-[11px]" onClick={onToggle}>
          {browsing ? "Study" : "Browse all"}
        </button>
      </div>
    </div>
  );
}
