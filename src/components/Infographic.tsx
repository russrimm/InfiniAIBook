"use client";

import { InlineCited } from "./Markdown";
import { styleDef, type InfographicTheme } from "@/lib/infographic";
import type { Citation, InfographicContent } from "@/lib/types";

type Props = { content: InfographicContent; citations?: Citation[] };

const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

export default function Infographic({ content, citations }: Props) {
  const def = styleDef(content.style);
  const t = def.theme;

  const headingStyle: React.CSSProperties = {
    color: t.heading,
    fontFamily: t.headingFont,
    letterSpacing: t.uppercaseHeadings ? "0.07em" : t.letterSpacing,
    textTransform: t.uppercaseHeadings ? "uppercase" : undefined,
  };

  const card: React.CSSProperties = {
    background: t.surface,
    border: `${t.borderWidth}px ${t.borderStyle} ${t.border}`,
    borderRadius: t.radius,
    boxShadow: t.shadow,
  };

  const cite = (text: string) => <InlineCited text={text} citations={citations} />;

  const Bullets = ({ items }: { items: string[] }) => (
    <ul className="space-y-1.5">
      {items.map((b, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-snug">
          <span
            className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: t.accent }}
          />
          <span>{cite(b)}</span>
        </li>
      ))}
    </ul>
  );

  const Section = ({
    section,
    large,
  }: {
    section: InfographicContent["sections"][number];
    large?: boolean;
  }) => (
    <div className="p-4" style={card}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={large ? "text-2xl" : "text-xl"}>{section.icon || "•"}</span>
        <h3
          className={`font-semibold ${large ? "text-[17px]" : "text-[15px]"}`}
          style={headingStyle}
        >
          {section.heading}
        </h3>
      </div>
      <Bullets items={section.bullets} />
    </div>
  );

  const Stats = () =>
    content.stats.length === 0 ? null : (
      <div className={`grid gap-3 ${STAT_COLS[Math.min(content.stats.length, 4)]}`}>
        {content.stats.map((s, i) => (
          <div key={i} className="px-4 py-5 text-center" style={card}>
            <div
              className="text-[27px] leading-none font-bold tracking-tight"
              style={{
                color: t.statValue,
                textShadow: t.glow ? `0 0 16px ${t.accent}66` : undefined,
              }}
            >
              {s.value}
            </div>
            <div className="mt-1.5 text-[13px] font-medium" style={{ color: t.heading }}>
              {s.label}
            </div>
            {s.caption && (
              <p className="mt-1.5 text-[11px] leading-snug" style={{ color: t.muted }}>
                {cite(s.caption)}
              </p>
            )}
          </div>
        ))}
      </div>
    );

  const Takeaway = () =>
    !content.takeaway ? null : (
      <div
        className="px-5 py-4"
        style={{
          ...card,
          background: `color-mix(in srgb, ${t.accent} 10%, ${t.surface})`,
          borderColor: `color-mix(in srgb, ${t.accent} 45%, ${t.border})`,
        }}
      >
        <div
          className="mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase"
          style={{ color: t.accent }}
        >
          Key takeaway
        </div>
        <p className="text-[15px] leading-relaxed font-medium" style={{ color: t.heading }}>
          {cite(content.takeaway)}
        </p>
      </div>
    );

  const Flow = () =>
    !content.flow?.length ? null : (
      <div className="flex flex-wrap items-center gap-2">
        {content.flow.map((stage, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="px-3 py-2 text-[12.5px] font-medium"
              style={{
                ...card,
                borderColor: t.accent,
                boxShadow: t.glow ? `0 0 14px -2px ${t.accent}55` : t.shadow,
                color: t.heading,
              }}
            >
              <span
                className="mr-1.5 text-[10px] font-bold"
                style={{ color: t.accent }}
              >
                {i + 1}
              </span>
              {stage}
            </div>
            {i < content.flow!.length - 1 && (
              <span style={{ color: t.accent }} aria-hidden>
                →
              </span>
            )}
          </div>
        ))}
      </div>
    );

  const NextSteps = () =>
    !content.nextSteps?.length ? null : (
      <div className="p-4" style={card}>
        <h3
          className="mb-2.5 text-[13px] font-semibold"
          style={{ ...headingStyle, letterSpacing: "0.09em" }}
        >
          Next steps
        </h3>
        <ol className="space-y-2">
          {content.nextSteps.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ background: t.accent, color: t.surface }}
              >
                {i + 1}
              </span>
              <span>{cite(s)}</span>
            </li>
          ))}
        </ol>
      </div>
    );

  const PullQuote = () =>
    !content.pullQuote ? null : (
      <blockquote
        className="my-5 px-6 py-4 text-center"
        style={{
          borderTop: `${t.borderWidth}px ${t.borderStyle} ${t.border}`,
          borderBottom: `${t.borderWidth}px ${t.borderStyle} ${t.border}`,
        }}
      >
        <p
          className="text-[19px] leading-snug italic"
          style={{ color: t.accent, fontFamily: t.headingFont }}
        >
          “{content.pullQuote}”
        </p>
      </blockquote>
    );

  /** Bento and cutout size the first card largest, so rank matters. */
  const BentoBody = () => (
    <div className="grid gap-3 sm:grid-cols-6">
      {content.sections.map((s, i) => (
        <div
          key={i}
          className={
            i === 0
              ? "sm:col-span-6"
              : content.sections.length % 2 === 0
                ? "sm:col-span-3"
                : i === 1
                  ? "sm:col-span-4"
                  : "sm:col-span-2"
          }
        >
          <Section section={s} large={i === 0} />
        </div>
      ))}
    </div>
  );

  const StackBody = () => (
    <div className="grid gap-3 sm:grid-cols-2">
      {content.sections.map((s, i) => (
        <Section key={i} section={s} />
      ))}
    </div>
  );

  const EditorialBody = () => (
    <div className="space-y-4">
      {content.sections.map((s, i) => (
        <div key={i}>
          <h3 className="mb-1.5 text-[17px] font-semibold" style={headingStyle}>
            <span className="mr-2">{s.icon}</span>
            {s.heading}
          </h3>
          <Bullets items={s.bullets} />
          {i === 0 && <PullQuote />}
        </div>
      ))}
      {!content.sections.length && <PullQuote />}
    </div>
  );

  const body =
    def.layout === "bento" ? (
      <BentoBody />
    ) : def.layout === "editorial" ? (
      <EditorialBody />
    ) : (
      <StackBody />
    );

  // Flat vector prints the conclusion first; the rest lead with the numbers.
  const takeawayFirst = content.style === "flat";

  return (
    <div
      className="overflow-hidden"
      style={{
        background: t.texture ? `${t.texture}, ${t.bg}` : t.bg,
        borderRadius: Math.max(t.radius, 8),
        border: `${t.borderWidth}px solid ${t.border}`,
        color: t.text,
        fontFamily: t.font,
        // Citation pills pick up the theme rather than the app's dark default.
        ["--cite-bg" as string]: `color-mix(in srgb, ${t.accent} 14%, transparent)`,
        ["--cite-border" as string]: `color-mix(in srgb, ${t.accent} 40%, transparent)`,
        ["--cite-fg" as string]: t.accent,
      }}
    >
      <header
        className="px-7 py-7 text-center"
        style={{
          background: t.headerBg,
          borderBottom:
            t.headerBg === "transparent" || t.headerBg === t.bg
              ? `${t.borderWidth}px ${t.borderStyle} ${t.border}`
              : undefined,
        }}
      >
        <h1
          className="text-[26px] leading-tight font-bold sm:text-[30px]"
          style={{
            color: t.headerText,
            fontFamily: t.headingFont,
            letterSpacing: t.uppercaseHeadings ? "0.04em" : undefined,
            textShadow: t.glow ? `0 0 26px ${t.accent}55` : undefined,
          }}
        >
          {content.title}
        </h1>
        {content.subtitle && (
          <p
            className="mx-auto mt-2 max-w-xl text-sm"
            style={{ color: t.headerSubText, fontFamily: t.font }}
          >
            {content.subtitle}
          </p>
        )}
      </header>

      <div className="space-y-4 p-5 sm:p-6">
        {takeawayFirst && <Takeaway />}
        <Flow />
        <Stats />
        {body}
        <NextSteps />
        {!takeawayFirst && <Takeaway />}
      </div>
    </div>
  );
}

export type { InfographicTheme };
