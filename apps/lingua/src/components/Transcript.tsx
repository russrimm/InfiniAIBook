"use client";

import { useEffect, useRef } from "react";
import { isLanguage, language } from "@/lib/languages";
import { shortName, type Persona } from "@/lib/personas";
import type { Correction, Turn } from "@/lib/types";
import type { Notice } from "@/lib/conversation";

type PlacedNotice = Omit<Notice, "afterTurnId"> & { afterTurn: number };
import { PersonaPortrait } from "./PersonaPortrait";

type Line = Turn & { id?: string; pending?: boolean };

function CorrectionCard({ c }: { c: Correction }) {
  return (
    <div className="mt-1.5 rounded-lg border border-warm/25 bg-warmsoft px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span dir="auto" className="text-ink/60 line-through decoration-warm/60">
          {c.learnerSaid}
        </span>
        <span aria-hidden className="text-warm">
          →
        </span>
        <span dir="auto" className="font-medium">
          {c.corrected}
        </span>
      </div>
      {c.explanation && (
        <p dir="auto" className="mt-0.5 text-xs text-ink/70">
          {c.explanation}
        </p>
      )}
    </div>
  );
}

function stamp(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Transcript({
  turns,
  corrections,
  notices = [],
  persona,
  showGloss,
  follow = false,
  learnerLabel = "You",
}: {
  turns: Line[];
  corrections: Correction[];
  notices?: PlacedNotice[];
  persona: Persona;
  showGloss: boolean;
  /** Keep the newest line in view, for a live call. */
  follow?: boolean;
  learnerLabel?: string;
}) {
  const endRef = useRef<HTMLLIElement>(null);
  const lastText = turns.at(-1)?.text;

  useEffect(() => {
    if (follow) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [follow, turns.length, lastText, notices.length]);

  const noticesAfter = (i: number) => notices.filter((n) => n.afterTurn === i);

  return (
    <ol className="space-y-4" aria-live={follow ? "polite" : undefined}>
      {noticesAfter(-1).map((n) => (
        <li key={n.id}>
          <NoticePill n={n} />
        </li>
      ))}
      {turns.map((t, i) => {
        const mine = t.role === "learner";
        const lang = t.lang && isLanguage(t.lang) ? language(t.lang) : null;
        const fixes = corrections.filter((c) => c.turnIndex === i);
        return (
          <li key={t.id ?? i} className="space-y-4">
            <div className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && (
                <div className="shrink-0 pt-5">
                  <PersonaPortrait portrait={persona.portrait} size={32} title={shortName(persona)} />
                </div>
              )}
              <div className={`max-w-[85%] ${mine ? "items-end text-right" : ""} flex flex-col`}>
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-ink/70">{mine ? learnerLabel : shortName(persona)}</span>
                  <span className="tabular-nums">{stamp(t.at)}</span>
                  {lang && (
                    <span title={lang.name} aria-label={lang.name}>
                      {lang.flag}
                    </span>
                  )}
                  {t.interrupted && <span className="italic">cut off</span>}
                </div>
                <div
                  dir="auto"
                  className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-left ${
                    mine ? "rounded-tr-sm bg-accent text-white" : "rounded-tl-sm bg-surface shadow-sm ring-1 ring-line"
                  }`}
                >
                  {t.text || (
                    <span className={`inline-flex gap-1 ${mine ? "text-white/70" : "text-muted"}`} aria-label="Listening">
                      <span className="animate-pulse">•</span>
                      <span className="animate-pulse [animation-delay:150ms]">•</span>
                      <span className="animate-pulse [animation-delay:300ms]">•</span>
                    </span>
                  )}
                </div>
                {showGloss && t.gloss && (
                  <p dir="auto" className="mt-1 px-1 text-left text-sm text-muted italic">
                    {t.gloss}
                  </p>
                )}
                <div className="text-left">
                  {fixes.map((c, k) => (
                    <CorrectionCard key={k} c={c} />
                  ))}
                </div>
              </div>
            </div>
            {noticesAfter(i).map((n) => (
              <NoticePill key={n.id} n={n} />
            ))}
          </li>
        );
      })}
      <li ref={endRef} aria-hidden className="h-0 list-none" />
    </ol>
  );
}

function NoticePill({ n }: { n: PlacedNotice }) {
  const tone =
    n.kind === "switch"
      ? "bg-accentsoft text-accent"
      : n.kind === "scaffold"
        ? "bg-warmsoft text-warm"
        : "bg-surface2 text-muted";
  return (
    <div className="flex justify-center">
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{n.text}</span>
    </div>
  );
}
