"use client";

import { useId } from "react";
import { InlineCited } from "./Markdown";
import Metaphor from "./Metaphors";
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
  // Distinct per instance: the gallery shows several infographics at once,
  // and SVG marker ids are document-wide.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
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

  /**
   * Header text sits on a themed, often accent-colored band where a citation
   * pill is illegible. Newly generated artifacts have these stripped already;
   * this also cleans up ones stored before that.
   */
  const plain = (s: string) => s.replace(/\s*\[\d+\](?:\[\d+\])*/g, "").trim();

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
          {takeawayLabel}
        </div>
        <p className="text-[15px] leading-relaxed font-medium" style={{ color: t.heading }}>
          {cite(content.takeaway)}
        </p>
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

  /**
   * Stages and their detail as one object, rather than a row of chips floating
   * above unrelated cards — the weakness in both source templates this merges.
   */
  const FlowBody = () => {
    const stages = content.flow ?? [];
    if (!stages.length) return <StackBody />;
    return (
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const section = content.sections[i];
          return (
            <div key={i}>
              <div className="flex items-stretch gap-3">
                <div className="flex shrink-0 flex-col items-center">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold"
                    style={{
                      background: t.accent,
                      color: t.surface,
                      boxShadow: t.glow ? `0 0 16px -2px ${t.accent}` : undefined,
                    }}
                  >
                    {i + 1}
                  </span>
                  {i < stages.length - 1 && (
                    <span
                      className="mt-1 w-px flex-1"
                      style={{ background: `color-mix(in srgb, ${t.accent} 45%, transparent)` }}
                      aria-hidden
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 p-4" style={card}>
                  <div className="mb-1.5 flex items-center gap-2">
                    {section?.icon && <span className="text-lg">{section.icon}</span>}
                    <h3 className="text-[15px] font-semibold" style={headingStyle}>
                      {section?.heading || stage}
                    </h3>
                  </div>
                  {section ? (
                    <Bullets items={section.bullets} />
                  ) : (
                    <p className="text-[13px]" style={{ color: t.muted }}>
                      {stage}
                    </p>
                  )}
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="py-1 pl-[0.9rem] text-[13px]" style={{ color: t.accent }} aria-hidden>
                  ↓
                </div>
              )}
            </div>
          );
        })}
        {content.sections.slice(stages.length).map((s, i) => (
          <Section key={`extra-${i}`} section={s} />
        ))}
      </div>
    );
  };

  const Chart = () => {
    const data = content.chart ?? [];
    if (data.length < 2) return null;
    const max = Math.max(...data.map((d) => d.value)) || 1;
    return (
      <div className="p-4" style={card}>
        <h3 className="mb-3 text-[13px] font-semibold" style={headingStyle}>
          By the numbers
        </h3>
        <div className="space-y-2.5">
          {data.map((d, i) => (
            <div key={i}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-[12.5px]" style={{ color: t.text }}>
                  {d.label}
                </span>
                <span
                  className="shrink-0 text-[12.5px] font-semibold tabular-nums"
                  style={{ color: t.statValue }}
                >
                  {d.display ?? d.value}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: `color-mix(in srgb, ${t.accent} 12%, transparent)` }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (d.value / max) * 100)}%`,
                    background: `linear-gradient(90deg, ${t.accent}, ${t.accent2})`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const CompareBody = () => {
    const c = content.compare;
    if (!c) return <StackBody />;
    const head: React.CSSProperties = {
      color: t.heading,
      fontFamily: t.headingFont,
      fontWeight: 650,
    };
    return (
      <div className="space-y-3">
        <div className="overflow-hidden" style={card}>
          <div
            className="grid grid-cols-[1.1fr_1fr_1fr] gap-px"
            style={{ background: t.border }}
          >
            <div className="px-3 py-2.5 text-[12px]" style={{ background: t.surface, color: t.muted }}>
              &nbsp;
            </div>
            <div
              className="px-3 py-2.5 text-center text-[13px]"
              style={{ ...head, background: `color-mix(in srgb, ${t.accent} 12%, ${t.surface})` }}
            >
              {c.aLabel}
            </div>
            <div
              className="px-3 py-2.5 text-center text-[13px]"
              style={{ ...head, background: `color-mix(in srgb, ${t.accent2} 12%, ${t.surface})` }}
            >
              {c.bLabel}
            </div>

            {c.rows.map((row, i) => (
              <div key={i} className="contents">
                <div
                  className="px-3 py-3 text-[12.5px] font-medium"
                  style={{ background: t.surface, color: t.heading }}
                >
                  {row.feature}
                </div>
                <div
                  className="px-3 py-3 text-[12.5px] leading-snug"
                  style={{ background: `color-mix(in srgb, ${t.accent} 5%, ${t.surface})` }}
                >
                  {cite(row.a)}
                </div>
                <div
                  className="px-3 py-3 text-[12.5px] leading-snug"
                  style={{ background: `color-mix(in srgb, ${t.accent2} 5%, ${t.surface})` }}
                >
                  {cite(row.b)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {c.verdict && (
          <div
            className="px-5 py-4"
            style={{
              ...card,
              background: `color-mix(in srgb, ${t.accent} 8%, ${t.surface})`,
            }}
          >
            <div
              className="mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase"
              style={{ color: t.accent }}
            >
              Verdict
            </div>
            <p className="text-[14px] leading-relaxed" style={{ color: t.heading }}>
              {cite(c.verdict)}
            </p>
          </div>
        )}

        {content.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
      </div>
    );
  };

  const ChecklistBody = () => {
    const items = content.checklist ?? [];
    if (!items.length) return <StackBody />;
    return (
      <div className="space-y-3">
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3 p-3.5" style={card}>
              <span
                className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded text-[12px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${t.accent} 16%, transparent)`,
                  color: t.accent,
                  border: `1px solid color-mix(in srgb, ${t.accent} 45%, transparent)`,
                }}
                aria-hidden
              >
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold" style={{ color: t.heading }}>
                  {item.title}
                </p>
                {item.detail && (
                  <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: t.text }}>
                    {cite(item.detail)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {content.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
      </div>
    );
  };

  const DataBody = () => (
    <div className="space-y-3">
      <Chart />
      <div className="grid gap-3 sm:grid-cols-2">
        {content.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
      </div>
    </div>
  );

  /**
   * Wide editorial layout: a few thematic regions, each holding concepts shown
   * as a metaphor plus a bold takeaway, with any real figure set oversized.
   */
  const IllustratedBody = () => {
    const regions = content.regions ?? [];
    if (!regions.length) return <StackBody />;

    // Alternate the two theme colors so regions read as distinct bands.
    const tint = (i: number) => (i % 2 === 0 ? t.accent : t.accent2);

    return (
      <div className="space-y-5">
        <HubCaption />
        {regions.map((region, ri) => {
          const c = tint(ri);
          const soft = `color-mix(in srgb, ${c} 14%, #ffffff)`;
          return (
            <section
              key={ri}
              className="rounded-2xl px-4 py-4 sm:px-5"
              style={{ background: `color-mix(in srgb, ${c} 5%, transparent)` }}
            >
              <div className="mb-3.5 flex items-center gap-2.5">
                <span
                  className="h-6 w-1.5 shrink-0 rounded-full"
                  style={{ background: c }}
                  aria-hidden
                />
                <h2
                  className="text-[15px] font-bold tracking-tight sm:text-[17px]"
                  style={{ color: t.heading, fontFamily: t.headingFont }}
                >
                  {region.heading}
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {region.concepts.map((concept, ci) => (
                  <article
                    key={ci}
                    className="flex flex-col gap-2.5 p-4"
                    style={{
                      background: t.surface,
                      border: `1px solid color-mix(in srgb, ${c} 26%, ${t.border})`,
                      borderRadius: t.radius,
                      boxShadow: t.shadow,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Metaphor metaphor={concept.metaphor} accent={c} soft={soft} size={56} />
                      {concept.value && (
                        <span
                          className="text-[26px] leading-none font-extrabold tracking-tight tabular-nums sm:text-[30px]"
                          style={{ color: c }}
                        >
                          {concept.value}
                        </span>
                      )}
                    </div>
                    <h3
                      className="text-[14.5px] leading-snug font-bold"
                      style={{ color: t.heading, fontFamily: t.headingFont }}
                    >
                      {concept.takeaway}
                    </h3>
                    {concept.detail && (
                      <p className="text-[12.5px] leading-snug" style={{ color: t.text }}>
                        {cite(concept.detail)}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}

        {content.sections.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {content.sections.map((s, i) => (
              <Section key={i} section={s} />
            ))}
          </div>
        )}
        <GuideExtras />
      </div>
    );
  };

  const ImageBody = () => {
    if (!content.imageUrl) {
      return (
        <p className="text-sm" style={{ color: t.muted }}>
          This infographic has no rendered image.
        </p>
      );
    }
    return (
      <div className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG served from our own API, not a static asset */}
        <img
          src={content.imageUrl}
          alt={plain(content.title) || "Generated infographic"}
          className="w-full"
          style={{ borderRadius: t.radius, border: `${t.borderWidth}px solid ${t.border}` }}
        />
        {/* Text inside the image is neither selectable nor citable, so the
            brief it was drawn from is repeated here with its citations. */}
        <HubCaption />
        {!!content.regions?.length && (
          <div className="space-y-3">
            {content.regions.map((r, i) => (
              <div key={i} style={card} className="p-4">
                <h3
                  className="text-[11px] font-bold tracking-[0.12em] uppercase"
                  style={{ ...headingStyle, color: t.accent }}
                >
                  {plain(r.heading)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {r.concepts?.map((c, j) => (
                    <li key={j} className="text-sm">
                      <span className="font-semibold" style={{ color: t.heading }}>
                        {plain(c.takeaway)}
                        {c.value ? (
                          <span style={{ color: t.statValue }}> · {plain(c.value)}</span>
                        ) : null}
                      </span>
                      {c.detail && (
                        <span style={{ color: t.muted }}> — {cite(c.detail)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <GuideExtras />
        <p className="text-[11px]" style={{ color: t.muted }}>
          Illustration generated by {content.imageModel || "an image model"}. Wording
          is drawn from your sources; verify any text rendered inside the image.
        </p>
      </div>
    );
  };

  const captionHeading = (label: string) => (
    <h3
      className="text-[11px] font-bold tracking-[0.12em] uppercase"
      style={{ ...headingStyle, color: t.accent }}
    >
      {label}
    </h3>
  );

  /** The visual guide's hub, kept as a cited caption. */
  const HubCaption = () =>
    !content.hub ? null : (
      <div style={card} className="p-4">
        {captionHeading(plain(content.hub.label))}
        {content.hub.caption && (
          <p className="mt-2 text-sm" style={{ color: t.muted }}>
            {cite(content.hub.caption)}
          </p>
        )}
      </div>
    );

  /** The visual guide's graded scale and comparison matrix, as cited text. */
  const GuideExtras = () => (
    <>
      {!!content.scale?.length && (
        <div style={card} className="p-4">
          {captionHeading("Scale")}
          <ul className="mt-2 space-y-1.5">
            {content.scale.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold" style={{ color: t.heading }}>
                  {plain(s.tier)}
                  {s.figure ? (
                    <span style={{ color: t.statValue }}> · {plain(s.figure)}</span>
                  ) : null}
                </span>
                {s.example && <span style={{ color: t.muted }}> — {cite(s.example)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!!content.matrix?.rows.length && (
        <div style={card} className="overflow-x-auto p-4">
          {captionHeading("Comparison")}
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-1.5 pr-3" />
                {content.matrix.columns.map((c, i) => (
                  <th key={i} className="py-1.5 pr-3 font-semibold" style={{ color: t.heading }}>
                    {plain(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.matrix.rows.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td className="py-1.5 pr-3 font-semibold" style={{ color: t.heading }}>
                    {plain(r.feature)}
                  </td>
                  {r.values.map((v, j) => (
                    <td key={j} className="py-1.5 pr-3" style={{ color: t.muted }}>
                      {cite(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  const ExtraSections = ({ cols = 2 }: { cols?: 1 | 2 }) =>
    !content.sections.length ? null : (
      <div className={`grid gap-3 ${cols === 2 ? "sm:grid-cols-2" : ""}`}>
        {content.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
      </div>
    );

  /** Dated milestones on a rail, alternating sides on wide screens. */
  const TimelineBody = () => {
    const items = content.milestones ?? [];
    if (!items.length) return <StackBody />;
    return (
      <div className="space-y-5">
        <ol className="relative">
          <span
            aria-hidden
            className="absolute top-2 bottom-2 left-[0.6rem] w-0.5 sm:left-1/2 sm:-translate-x-1/2"
            style={{ background: `linear-gradient(${t.accent}, ${t.accent2})` }}
          />
          {items.map((m, i) => {
            const right = i % 2 === 1;
            const c = right ? t.accent2 : t.accent;
            return (
              <li key={i} className="relative grid pb-5 pl-8 last:pb-0 sm:grid-cols-2 sm:gap-12 sm:pl-0">
                <span
                  aria-hidden
                  className="absolute top-1.5 left-0 h-5 w-5 rounded-full sm:left-1/2 sm:-translate-x-1/2"
                  style={{ background: t.surface, border: `4px solid ${c}` }}
                />
                <div className={right ? "sm:col-start-2" : "sm:text-right"}>
                  <span
                    className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide tabular-nums"
                    style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}
                  >
                    {m.date || `Step ${i + 1}`}
                  </span>
                  <div className="mt-1.5 p-3.5 text-left" style={card}>
                    <h3 className="text-[14.5px] font-semibold" style={headingStyle}>
                      {m.title}
                    </h3>
                    {m.detail && (
                      <p className="mt-1 text-[12.5px] leading-snug">{cite(m.detail)}</p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <ExtraSections />
      </div>
    );
  };

  /**
   * Pyramid (narrow apex first) or funnel (wide mouth first): trapezoid bands
   * whose sides slope continuously, each with its detail alongside.
   */
  const TierBody = ({ funnel }: { funnel?: boolean }) => {
    const levels = content.levels ?? [];
    if (!levels.length) return <StackBody />;
    const n = levels.length;
    const half = (k: number) => (funnel ? 50 - (34 * k) / n : 9 + (41 * k) / n);
    return (
      <div className="space-y-5">
        <ol className="space-y-1.5">
          {levels.map((l, i) => {
            const top = half(i);
            const bottom = half(i + 1);
            const mix = n > 1 ? Math.round((i / (n - 1)) * 100) : 0;
            const fill = `color-mix(in srgb, ${t.accent2} ${mix}%, ${t.accent})`;
            return (
              <li
                key={i}
                className="grid items-center gap-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] sm:gap-5"
              >
                <div
                  className="flex min-h-[4.25rem] flex-col items-center justify-center px-2 py-2 text-center"
                  style={{
                    background: fill,
                    color: "#ffffff",
                    clipPath: `polygon(${50 - top}% 0, ${50 + top}% 0, ${50 + bottom}% 100%, ${50 - bottom}% 100%)`,
                  }}
                >
                  {l.value && (
                    <span className="text-[19px] leading-none font-extrabold tabular-nums">
                      {l.value}
                    </span>
                  )}
                  <span
                    className="max-w-[60%] text-[12.5px] leading-tight font-semibold"
                    style={{ fontFamily: t.headingFont }}
                  >
                    {l.label}
                  </span>
                </div>
                <div className="flex gap-2.5 p-3" style={card}>
                  <span
                    className="mt-0.5 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: fill }}
                    aria-hidden
                  />
                  <p className="text-[12.5px] leading-snug">
                    <span className="font-semibold" style={{ color: t.heading }}>
                      {l.label}.
                    </span>{" "}
                    {cite(l.detail)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <ExtraSections />
      </div>
    );
  };

  /** Stages around a loop, with each stage's detail below. */
  const CycleBody = () => {
    const stages = (content.flow ?? []).slice(0, 6);
    if (stages.length < 3) return <FlowBody />;
    const n = stages.length;
    const R = 37;
    const at = (k: number) => {
      const a = ((-90 + (360 * k) / n) * Math.PI) / 180;
      return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a), a };
    };
    // Arcs stop short of each node so the arrowhead is visible.
    const gap = (14 / (2 * Math.PI * R)) * 2 * Math.PI;
    const arcs = stages.map((_, i) => {
      const a1 = at(i).a + gap;
      const a2 = at(i + 1).a - gap;
      const p = (a: number) => `${50 + R * Math.cos(a)} ${50 + R * Math.sin(a)}`;
      return `M ${p(a1)} A ${R} ${R} 0 0 1 ${p(a2)}`;
    });
    const markerId = `cyc-${uid}`;
    return (
      <div className="space-y-5">
        <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={t.accent} />
              </marker>
            </defs>
            {arcs.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={t.accent}
                strokeWidth="1.1"
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                opacity="0.75"
              />
            ))}
          </svg>
          <div
            className="absolute top-1/2 left-1/2 flex h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-center text-[12px] font-semibold"
            style={{
              background: `color-mix(in srgb, ${t.accent} 10%, ${t.surface})`,
              border: `1px dashed color-mix(in srgb, ${t.accent} 45%, transparent)`,
              color: t.heading,
            }}
          >
            <span className="px-2">↻ Repeats</span>
          </div>
          {stages.map((s, i) => {
            const p = at(i);
            return (
              <div
                key={i}
                className="absolute flex max-w-[9rem] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[12px] leading-tight font-semibold shadow-sm"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  background: t.surface,
                  border: `1px solid color-mix(in srgb, ${t.accent} 40%, ${t.border})`,
                  color: t.heading,
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: i % 2 ? t.accent2 : t.accent, color: "#ffffff" }}
                >
                  {i + 1}
                </span>
                <span>{s}</span>
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {content.sections.map((s, i) => (
            <Section key={i} section={s} />
          ))}
        </div>
      </div>
    );
  };

  const MythsBody = () => {
    const items = content.myths ?? [];
    if (!items.length) return <StackBody />;
    const myth = t.accent2;
    const fact = t.accent;
    return (
      <div className="space-y-3">
        {items.map((m, i) => (
          <div
            key={i}
            className="grid items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)]"
          >
            <div
              className="p-3.5"
              style={{
                ...card,
                background: `color-mix(in srgb, ${myth} 7%, ${t.surface})`,
                borderColor: `color-mix(in srgb, ${myth} 35%, ${t.border})`,
              }}
            >
              <div className="mb-1 text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: myth }}>
                ✗ Myth
              </div>
              <p className="text-[13.5px] leading-snug font-medium line-through decoration-1" style={{ color: t.heading, textDecorationColor: `color-mix(in srgb, ${myth} 60%, transparent)` }}>
                {plain(m.myth)}
              </p>
            </div>
            <div className="hidden items-center text-lg sm:flex" style={{ color: t.muted }} aria-hidden>
              →
            </div>
            <div
              className="p-3.5"
              style={{
                ...card,
                background: `color-mix(in srgb, ${fact} 7%, ${t.surface})`,
                borderColor: `color-mix(in srgb, ${fact} 35%, ${t.border})`,
              }}
            >
              <div className="mb-1 text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: fact }}>
                ✓ Fact
              </div>
              <p className="text-[13px] leading-snug">{cite(m.fact)}</p>
            </div>
          </div>
        ))}
        <ExtraSections />
      </div>
    );
  };

  const ProsConsBody = () => {
    const pros = content.pros ?? [];
    const cons = content.cons ?? [];
    if (!pros.length && !cons.length) return <StackBody />;
    const column = (label: string, items: string[], c: string, mark: string) => (
      <div
        className="p-4"
        style={{ ...card, borderTop: `4px solid ${c}` }}
      >
        <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold" style={headingStyle}>
          <span aria-hidden>{mark === "+" ? "👍" : "👎"}</span>
          {label}
        </h3>
        <ul className="space-y-2">
          {items.map((p, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                style={{ background: `color-mix(in srgb, ${c} 15%, transparent)`, color: c }}
                aria-hidden
              >
                {mark}
              </span>
              <span>{cite(p)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {pros.length > 0 && column("Pros", pros, t.accent, "+")}
          {cons.length > 0 && column("Cons", cons, t.accent2, "−")}
        </div>
        <ExtraSections />
      </div>
    );
  };

  const CheatsheetBody = () => {
    const terms = content.terms ?? [];
    if (!terms.length) return <StackBody />;
    return (
      <div className="space-y-4">
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {terms.map((term, i) => (
            <div key={i} className="px-3.5 py-3" style={card}>
              <dt
                className="text-[12.5px] font-bold"
                style={{ color: i % 3 === 2 ? t.accent2 : t.accent, fontFamily: t.headingFont }}
              >
                {term.term}
              </dt>
              <dd className="mt-1 text-[12.5px] leading-snug">{cite(term.definition)}</dd>
            </div>
          ))}
        </dl>
        <ExtraSections />
      </div>
    );
  };

  /** Bricks stack from the foundation up: the first section sits at the bottom. */
  const BricksBody = () => {
    const BRICKS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2"];
    const n = content.sections.length;
    if (!n) return null;
    const rows = content.sections.map((s, i) => ({ s, i })).reverse();
    return (
      <div className="flex flex-col items-center gap-2.5 pt-2">
        {rows.map(({ s, i }) => {
          const color = BRICKS[i % BRICKS.length];
          const dark = color === "#f59e0b";
          // Each course sits a little narrower than the one beneath it.
          const step = n > 1 ? Math.min(8, 36 / (n - 1)) : 0;
          return (
            <div
              key={i}
              className="relative w-full px-4 pt-4 pb-3"
              style={{
                maxWidth: `${100 - i * step}%`,
                background: color,
                color: dark ? "#1a1610" : "#ffffff",
                borderRadius: 6,
                boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.18), 0 3px 0 rgba(0,0,0,0.12)`,
                // Citation pills sit on a saturated brick, so they go neutral.
                ["--cite-bg" as string]: "rgba(255,255,255,0.3)",
                ["--cite-border" as string]: "rgba(255,255,255,0.65)",
                ["--cite-fg" as string]: dark ? "#1a1610" : "#ffffff",
              }}
            >
              <span aria-hidden className="absolute -top-2 left-4 flex gap-3">
                {Array.from({ length: 6 }).map((_, k) => (
                  <span
                    key={k}
                    className="block h-2.5 w-6 rounded-t-md"
                    style={{ background: color, boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35)" }}
                  />
                ))}
              </span>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-lg">{s.icon || "🧱"}</span>
                <h3 className="text-[15px] font-bold" style={{ fontFamily: t.headingFont }}>
                  {s.heading}
                </h3>
                {i === 0 && (
                  <span className="ml-auto rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    Foundation
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {s.bullets.map((b, k) => (
                  <li key={k} className="text-[13px] leading-snug">
                    {cite(b)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    );
  };

  const body =
    def.layout === "bento" ? (
      <BentoBody />
    ) : def.layout === "editorial" ? (
      <EditorialBody />
    ) : def.layout === "illustrated" ? (
      <IllustratedBody />
    ) : def.layout === "image" ? (
      <ImageBody />
    ) : def.layout === "flow" ? (
      <FlowBody />
    ) : def.layout === "compare" ? (
      <CompareBody />
    ) : def.layout === "checklist" ? (
      <ChecklistBody />
    ) : def.layout === "data" ? (
      <DataBody />
    ) : def.layout === "timeline" ? (
      <TimelineBody />
    ) : def.layout === "pyramid" ? (
      <TierBody />
    ) : def.layout === "funnel" ? (
      <TierBody funnel />
    ) : def.layout === "cycle" ? (
      <CycleBody />
    ) : def.layout === "myths" ? (
      <MythsBody />
    ) : def.layout === "proscons" ? (
      <ProsConsBody />
    ) : def.layout === "cheatsheet" ? (
      <CheatsheetBody />
    ) : def.layout === "bricks" ? (
      <BricksBody />
    ) : (
      <StackBody />
    );

  // Flat vector prints the conclusion first; the rest lead with the numbers.
  const takeawayFirst = content.style === "flat";
  // Pros and cons end on the takeaway, so it reads as the verdict.
  const takeawayLabel = def.layout === "proscons" ? "Verdict" : "Key takeaway";
  const frameWidth =
    content.orientation === "portrait" ? 680 : content.orientation === "square" ? 920 : undefined;
  const fellBack = content.imageFallback
    ? styleDef(content.imageFallback.from).label
    : null;

  return (
    <div
      className="overflow-hidden"
      data-infographic-style={content.style ?? "classic"}
      style={{
        maxWidth: frameWidth,
        marginInline: frameWidth ? "auto" : undefined,
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
      {/* The image already contains the headline, so repeating it above the
          picture would show it twice. */}
      {def.layout !== "image" && (
      <header
        className={`text-center ${def.layout === "illustrated" ? "px-7 py-9" : "px-7 py-7"}`}
        style={{
          background: t.headerBg,
          borderBottom:
            t.headerBg === "transparent" || t.headerBg === t.bg
              ? `${t.borderWidth}px ${t.borderStyle} ${t.border}`
              : undefined,
        }}
      >
        <h1
          className={
            def.layout === "illustrated"
              ? "mx-auto max-w-3xl text-[30px] leading-[1.12] font-extrabold tracking-tight sm:text-[40px]"
              : "text-[26px] leading-tight font-bold sm:text-[30px]"
          }
          style={{
            color: t.headerText,
            fontFamily: t.headingFont,
            letterSpacing: t.uppercaseHeadings ? "0.04em" : undefined,
            textShadow: t.glow ? `0 0 26px ${t.accent}55` : undefined,
          }}
        >
          {plain(content.title)}
        </h1>
        {content.subtitle && (
          <p
            className="mx-auto mt-2 max-w-xl text-sm"
            style={{ color: t.headerSubText, fontFamily: t.font }}
          >
            {plain(content.subtitle)}
          </p>
        )}
      </header>
      )}

      <div className="space-y-4 p-5 sm:p-6">
        {fellBack && (
          <p
            role="note"
            className="rounded-lg px-3.5 py-2.5 text-[12px] leading-snug"
            style={{
              background: `color-mix(in srgb, ${t.accent} 8%, ${t.surface})`,
              border: `1px dashed color-mix(in srgb, ${t.accent} 45%, ${t.border})`,
              color: t.text,
            }}
          >
            <strong style={{ color: t.heading }}>Shown as Illustrated.</strong> The{" "}
            {fellBack} picture could not be drawn
            {content.imageFallback?.reason ? ` (${content.imageFallback.reason})` : ""}, so
            the cited brief it was based on is kept here instead. Check the image model
            under Models, then generate again to get the picture.
          </p>
        )}
        {takeawayFirst && <Takeaway />}
        {/* The generated image is the artifact itself, so it leads; the cited
            figures act as its caption rather than its preamble. */}
        {def.layout !== "image" && <Stats />}
        {body}
        {def.layout === "image" && <Stats />}
        <NextSteps />
        {!takeawayFirst && <Takeaway />}
      </div>
    </div>
  );
}

export type { InfographicTheme };
