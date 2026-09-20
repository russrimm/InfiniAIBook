"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InlineCited } from "./Markdown";
import type { Citation, QuizContent } from "@/lib/types";

/** Answers are personal and disposable, so they live outside the artifact. */
const keyFor = (id: string) => `onb:quiz:${id}`;

export default function Quiz({
  artifactId,
  content,
  citations,
}: {
  artifactId: string;
  content: QuizContent;
  citations?: Citation[];
}) {
  const all = content.questions;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  /** Indices of the questions in play; null means the whole quiz. */
  const [subset, setSubset] = useState<number[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(keyFor(artifactId));
      if (raw) {
        const saved = JSON.parse(raw) as {
          answers?: Record<number, number>;
          submitted?: boolean;
        };
        if (saved.answers) setAnswers(saved.answers);
        if (saved.submitted) setSubmitted(true);
      }
    } catch {
      /* corrupt or unavailable storage just means a fresh attempt */
    }
    setLoaded(true);
  }, [artifactId]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(
        keyFor(artifactId),
        JSON.stringify({ answers, submitted })
      );
    } catch {
      /* private mode or quota — progress is simply not kept */
    }
  }, [artifactId, answers, submitted, loaded]);

  const active = useMemo(() => subset ?? all.map((_, i) => i), [subset, all]);

  const total = active.length;
  const answered = active.filter((i) => answers[i] !== undefined).length;
  const score = active.reduce(
    (s, i) => s + (answers[i] === all[i].answerIndex ? 1 : 0),
    0
  );
  const missed = active.filter(
    (i) => answers[i] !== undefined && answers[i] !== all[i].answerIndex
  );

  const reset = useCallback((next: number[] | null) => {
    setSubset(next);
    setSubmitted(false);
    // Clearing only the questions back in play keeps the rest of the record.
    setAnswers((prev) => {
      if (!next) return {};
      const copy = { ...prev };
      for (const i of next) delete copy[i];
      return copy;
    });
  }, []);

  return (
    <div>
      {(content.difficulty || subset) && (
        <div className="mb-4 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          {content.difficulty && <span>Difficulty: {content.difficulty}</span>}
          {subset && (
            <>
              <span>·</span>
              <span>Reviewing {subset.length} missed</span>
              <button
                className="underline transition hover:text-[var(--fg)]"
                onClick={() => reset(null)}
              >
                show all
              </button>
            </>
          )}
        </div>
      )}

      {submitted && (
        <div className="fade-up mb-6 rounded-xl border border-[var(--border)] bg-[#0e1116] p-5 text-center">
          <div className="text-3xl font-semibold">
            {score}
            <span className="text-[var(--muted)]">/{total}</span>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {score === total
              ? "Perfect — you know these sources."
              : score / total >= 0.7
                ? "Solid. Review the misses below."
                : "Worth another pass through the sources."}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {missed.length > 0 && (
              <button
                className="btn btn-primary !py-1.5 !text-xs"
                onClick={() => reset(missed)}
              >
                Retry {missed.length} missed
              </button>
            )}
            <button className="btn !py-1.5 !text-xs" onClick={() => reset(null)}>
              Retake all
            </button>
          </div>
        </div>
      )}

      <ol className="space-y-5">
        {active.map((qi, n) => {
          const q = all[qi];
          const picked = answers[qi];
          return (
            <li key={qi} className="rounded-xl border border-[var(--border)] p-4">
              <div className="mb-3 flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {n + 1}
                </span>
                <p className="text-[15px] leading-snug font-medium">
                  <InlineCited text={q.question} citations={citations} />
                </p>
              </div>
              <div className="space-y-1.5">
                {q.choices.map((c, ci) => {
                  const isPicked = picked === ci;
                  const isRight = ci === q.answerIndex;
                  let cls =
                    "border-[var(--border)] hover:border-[#39424f] hover:bg-[#171b21]";
                  if (submitted && isRight)
                    cls = "border-emerald-500/60 bg-emerald-500/10";
                  else if (submitted && isPicked)
                    cls = "border-red-500/60 bg-red-500/10";
                  else if (isPicked) cls = "border-[var(--accent)] bg-[#1b2030]";
                  return (
                    <button
                      key={ci}
                      disabled={submitted}
                      onClick={() => setAnswers({ ...answers, [qi]: ci })}
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition ${cls}`}
                    >
                      <span className="mt-px shrink-0 text-xs font-semibold text-[var(--muted)]">
                        {String.fromCharCode(65 + ci)}
                      </span>
                      <span className="flex-1">{c}</span>
                      {submitted && isRight && <span className="text-emerald-400">✓</span>}
                      {submitted && isPicked && !isRight && (
                        <span className="text-red-400">✕</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <p className="fade-up mt-3 rounded-lg bg-[#0e1116] px-3 py-2 text-[13px] leading-relaxed text-[var(--muted)]">
                  <InlineCited text={q.explanation} citations={citations} />
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {!submitted && (
        <button
          className="btn btn-primary mt-6 w-full"
          disabled={answered < total}
          onClick={() => setSubmitted(true)}
        >
          {answered < total
            ? `Answer all questions (${answered}/${total})`
            : "Check answers"}
        </button>
      )}
    </div>
  );
}
