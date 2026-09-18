"use client";

import { useState } from "react";
import { InlineCited } from "./Markdown";
import type { Citation, QuizContent } from "@/lib/types";

export default function Quiz({
  content,
  citations,
}: {
  content: QuizContent;
  citations?: Citation[];
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const total = content.questions.length;
  const answered = Object.keys(answers).length;
  const score = content.questions.reduce(
    (s, q, i) => s + (answers[i] === q.answerIndex ? 1 : 0),
    0
  );

  return (
    <div>
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
          <button
            className="btn mt-3"
            onClick={() => {
              setAnswers({});
              setSubmitted(false);
            }}
          >
            Retake
          </button>
        </div>
      )}

      <ol className="space-y-5">
        {content.questions.map((q, qi) => {
          const picked = answers[qi];
          return (
            <li key={qi} className="rounded-xl border border-[var(--border)] p-4">
              <div className="mb-3 flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-xs font-semibold text-[var(--muted)]">
                  {qi + 1}
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
