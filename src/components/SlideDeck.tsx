"use client";

import { useEffect, useMemo, useState } from "react";
import { SLIDE_THEMES } from "@/lib/slides";
import type { Citation, Slide, SlidesContent } from "@/lib/types";
import { InlineCited } from "./Markdown";

function layoutClass(slide: Slide): string {
  if (slide.layout === "title" || slide.layout === "section") {
    return "items-center justify-center text-center";
  }
  return "items-start justify-start";
}

export default function SlideDeck({
  content,
  citations,
}: {
  content: SlidesContent;
  citations: Citation[];
}) {
  const [index, setIndex] = useState(0);
  const theme = SLIDE_THEMES[content.theme] ?? SLIDE_THEMES.midnight;
  const slide = content.slides[index] ?? content.slides[0];
  const canPrev = index > 0;
  const canNext = index < content.slides.length - 1;

  const style = useMemo(
    () => ({
      "--slide-bg": theme.colors.background,
      "--slide-surface": theme.colors.surface,
      "--slide-text": theme.colors.text,
      "--slide-muted": theme.colors.muted,
      "--slide-accent": theme.colors.accent,
    }),
    [theme]
  );
  // Aptos ships with Office, not every browser; fall back to the system sans.
  const fallback = `"Segoe UI", system-ui, -apple-system, sans-serif`;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(content.slides.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [content.slides.length]);

  if (!slide) return <p className="text-sm text-[var(--muted)]">This deck has no slides.</p>;

  return (
    <div className="space-y-4" style={style as React.CSSProperties}>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--slide-bg)] p-3 shadow-2xl">
        <div
          className="relative aspect-video overflow-hidden rounded-xl bg-[var(--slide-surface)] p-[6%] text-[var(--slide-text)]"
          style={{ fontFamily: `"${theme.fonts.body}", ${fallback}` }}
        >
          <div className="absolute top-0 left-0 h-full w-2 bg-[var(--slide-accent)]" />
          <div className={`flex h-full flex-col gap-5 ${layoutClass(slide)}`}>
            <div>
              <div className="mb-3 h-1 w-16 rounded-full bg-[var(--slide-accent)]" />
              <h3
                className={`font-semibold tracking-tight ${
                  slide.layout === "title" ? "text-4xl sm:text-5xl" : "text-2xl sm:text-4xl"
                }`}
                style={{ fontFamily: `"${theme.fonts.heading}", ${fallback}` }}
              >
                {slide.title}
              </h3>
              {slide.subtitle && (
                <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--slide-muted)] sm:text-xl">
                  {slide.subtitle}
                </p>
              )}
            </div>
            {slide.bullets?.length ? (
              <ul className="max-w-3xl space-y-3 text-left text-base leading-snug sm:text-2xl">
                {slide.bullets.map((bullet, i) => (
                  <li key={`${bullet}-${i}`} className="flex gap-3">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--slide-accent)]" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <span className="absolute right-5 bottom-4 text-xs text-[var(--slide-muted)]">
            {index + 1}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button className="btn !text-[12px]" disabled={!canPrev} onClick={() => setIndex(index - 1)}>
            ← Previous
          </button>
          <button className="btn !text-[12px]" disabled={!canNext} onClick={() => setIndex(index + 1)}>
            Next →
          </button>
        </div>
        <span className="text-[12px] text-[var(--muted)]">
          Slide {index + 1} of {content.slides.length}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {content.slides.map((s, i) => (
          <button
            key={`${s.title}-${i}`}
            className={`w-28 shrink-0 rounded-lg border p-2 text-left transition ${
              i === index
                ? "border-[var(--slide-accent)] bg-[var(--slide-surface)]"
                : "border-[var(--border)] bg-well hover:border-line-hover"
            }`}
            onClick={() => setIndex(i)}
          >
            <div className="aspect-video rounded bg-[var(--slide-bg)] p-1">
              <div className="h-full rounded bg-[var(--slide-surface)] p-1 text-[6px] leading-tight text-[var(--slide-text)]">
                {s.title}
              </div>
            </div>
            <div className="mt-1 truncate text-[10px] text-[var(--muted)]">{i + 1}. {s.title}</div>
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-well p-4">
        <h3 className="text-[12px] font-semibold tracking-wide text-[var(--muted)] uppercase">
          Speaker notes
        </h3>
        <p className="mt-2 text-[14px] leading-relaxed text-prose-soft">
          {slide.notes ? (
            <InlineCited text={slide.notes} citations={citations} />
          ) : (
            <span className="text-[var(--muted)]">No notes for this slide.</span>
          )}
        </p>
      </section>
    </div>
  );
}
