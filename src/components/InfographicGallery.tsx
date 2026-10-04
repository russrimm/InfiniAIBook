"use client";

/**
 * Style previews and the style gallery for infographics.
 *
 * Every style is shown with a real example before anything is generated: the
 * HTML styles render the actual Infographic component on a shared sample
 * notebook, so a preview is exactly what the style produces. The image styles
 * cannot be drawn without spending an image-model call, so they show a
 * faithful layout sketch in their art direction, clearly labeled as such.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "./useDialog";
import Infographic from "./Infographic";
import Metaphor from "./Metaphors";
import { CitationContext } from "./CitationContext";
import {
  INFOGRAPHIC_STYLES,
  STYLE_GROUPS,
  STYLE_META,
  STYLE_ORDER,
  isImageStyle,
  type InfographicStyle,
  type StyleGroup,
} from "@/lib/infographic";
import { SAMPLE_CITATIONS, sampleInfographic } from "@/lib/infographicSamples";
import type { StyleSuggestion } from "@/lib/styleSuggest";

/** Width the examples are laid out at before being scaled to fit. */
const DESIGN_WIDTH = 960;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Art direction for the image-style sketches, matching the image prompts. */
const ART: Record<
  string,
  {
    bg: string;
    panel: string;
    border: string;
    ink: string;
    muted: string;
    accents: [string, string, string];
    font: string;
    headingFont: string;
    radius: number;
    panelShadow: string;
    texture?: string;
    tilt?: boolean;
    tab: (c: string) => React.CSSProperties;
  }
> = {
  guide: {
    bg: "#f7faf9",
    panel: "#eef6fb",
    border: "#cfe1ea",
    ink: "#0b1b2b",
    muted: "#4f6577",
    accents: ["#0e7490", "#2563eb", "#15803d"],
    font: 'var(--font-geist-sans), "Segoe UI", sans-serif',
    headingFont: 'var(--font-geist-sans), "Segoe UI", sans-serif',
    radius: 18,
    panelShadow: "0 10px 24px -18px rgba(15,34,51,0.45)",
    tab: (c) => ({ background: c, color: "#ffffff", borderRadius: 999 }),
  },
  image: {
    bg: "#f7faf9",
    panel: "#ffffff",
    border: "#d4e2e4",
    ink: "#0f2233",
    muted: "#51677a",
    accents: ["#0e7490", "#0ea5e9", "#15803d"],
    font: 'var(--font-geist-sans), "Segoe UI", sans-serif',
    headingFont: 'var(--font-geist-sans), "Segoe UI", sans-serif',
    radius: 16,
    panelShadow: "0 10px 24px -18px rgba(15,34,51,0.45)",
    tab: (c) => ({ color: c, borderBottom: `3px solid ${c}` }),
  },
  anime: {
    bg: "linear-gradient(160deg, #e0f2fe 0%, #fdf2f8 55%, #fef9c3 100%)",
    panel: "#ffffff",
    border: "#1f2937",
    ink: "#111827",
    muted: "#4b5563",
    accents: ["#f43f5e", "#0ea5e9", "#10b981"],
    font: 'ui-rounded, "Nunito", var(--font-geist-sans), sans-serif',
    headingFont: 'ui-rounded, "Nunito", var(--font-geist-sans), sans-serif',
    radius: 22,
    panelShadow: "5px 5px 0 #1f2937",
    texture:
      "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.9) 0 2px, transparent 3px), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.9) 0 2px, transparent 3px), radial-gradient(circle at 64% 88%, rgba(255,255,255,0.9) 0 2px, transparent 3px)",
    tab: (c) => ({
      background: c,
      color: "#ffffff",
      borderRadius: 999,
      border: "2px solid #1f2937",
    }),
  },
  retro: {
    bg: "#f3ead7",
    panel: "#f8f1e1",
    border: "#1f6f78",
    ink: "#1d2b2e",
    muted: "#4a5658",
    accents: ["#e4572e", "#1f6f78", "#d99a1e"],
    font: 'Georgia, "Rockwell", serif',
    headingFont: '"Arial Narrow", "Roboto Condensed", Impact, "Franklin Gothic Medium", sans-serif',
    radius: 4,
    panelShadow: "4px 4px 0 rgba(228,87,46,0.55)",
    texture: "radial-gradient(rgba(29,43,46,0.10) 1px, transparent 1.4px)",
    tab: (c) => ({ background: c, color: "#f8f1e1", letterSpacing: "0.08em" }),
  },
  papercraft: {
    bg: "#e8d5b5",
    panel: "#fffaf0",
    border: "#e6d3b0",
    ink: "#2f2a22",
    muted: "#6b604f",
    accents: ["#14b8a6", "#f97362", "#84cc16"],
    font: 'ui-rounded, var(--font-geist-sans), "Segoe UI", sans-serif',
    headingFont: 'ui-rounded, var(--font-geist-sans), "Segoe UI", sans-serif',
    radius: 10,
    panelShadow: "0 2px 0 rgba(47,42,34,0.08), 0 10px 18px -8px rgba(47,42,34,0.45)",
    texture:
      "repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 6px)",
    tilt: true,
    tab: (c) => ({ background: c, color: "#ffffff", borderRadius: 6 }),
  },
};

/** A layout sketch for an image style, in that style's art direction. */
function ImageStyleSketch({ style }: { style: InfographicStyle }) {
  const art = ART[style] ?? ART.image;
  const c = sampleInfographic(style);
  const regions = c.regions ?? [];
  const isGuide = style === "guide";
  const bgIsImage = art.bg.includes("gradient(");
  const bgLayers = [art.texture, bgIsImage ? art.bg : undefined].filter(Boolean);
  return (
    <div
      className="relative flex min-h-[720px] flex-col overflow-hidden px-8 pt-8 pb-12"
      style={{
        backgroundColor: bgIsImage ? undefined : art.bg,
        backgroundImage: bgLayers.length ? bgLayers.join(", ") : undefined,
        backgroundSize: style === "retro" ? "6px 6px" : undefined,
        color: art.ink,
        fontFamily: art.font,
        borderRadius: 16,
      }}
    >
      <h1
        className="text-center text-[40px] leading-tight font-extrabold tracking-tight"
        style={{
          fontFamily: art.headingFont,
          textTransform: style === "retro" ? "uppercase" : undefined,
          color: style === "retro" ? art.accents[0] : art.ink,
          WebkitTextStroke: style === "anime" ? "1px #1f2937" : undefined,
        }}
      >
        {c.title}
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-center text-[17px]" style={{ color: art.muted }}>
        {c.subtitle}
      </p>

      <div className="flex flex-1 flex-col justify-center">
        {isGuide && c.hub && (
          <div className="relative mt-6 flex justify-center">
            <svg
              viewBox="0 0 900 120"
              className="pointer-events-none absolute top-[70px] left-1/2 h-[120px] w-[900px] -translate-x-1/2"
              aria-hidden
            >
              <defs>
                <linearGradient id="sketch-ribbon" x1="0" x2="1">
                  <stop offset="0" stopColor="#2563eb" />
                  <stop offset="0.35" stopColor="#14b8a6" />
                  <stop offset="0.6" stopColor="#84cc16" />
                  <stop offset="0.8" stopColor="#f59e0b" />
                  <stop offset="1" stopColor="#db2777" />
                </linearGradient>
              </defs>
              {[150, 450, 750].map((x) => (
                <path
                  key={x}
                  d={`M 450 0 C 450 60, ${x} 40, ${x} 120`}
                  stroke="url(#sketch-ribbon)"
                  strokeWidth="14"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.85"
                />
              ))}
            </svg>
            <div
              className="relative z-10 flex h-[132px] w-[132px] flex-col items-center justify-center rounded-full text-center"
              style={{
                background: "radial-gradient(circle at 35% 30%, #67e8f9, #0e7490 70%)",
                boxShadow: "0 18px 30px -16px rgba(14,116,144,0.9), inset 0 -6px 12px rgba(0,0,0,0.18)",
                color: "#ffffff",
              }}
            >
              <span className="text-[30px]" aria-hidden>
                🪴
              </span>
              <span className="px-3 text-[15px] leading-tight font-bold">{c.hub.label}</span>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-3 gap-5 ${isGuide ? "mt-12" : "mt-8"}`}>
          {regions.map((r, i) => {
            const accent = art.accents[i % 3];
            return (
              <section
                key={i}
                className="relative px-4 pt-5 pb-4"
                style={{
                  background: art.panel,
                  border: `${style === "anime" ? 2 : 1}px solid ${style === "anime" ? art.border : style === "retro" ? accent : art.border}`,
                  borderRadius: art.radius,
                  boxShadow: art.panelShadow,
                  transform: art.tilt ? `rotate(${(i - 1) * 1.2}deg)` : undefined,
                }}
              >
                <h2
                  className="absolute -top-3.5 left-4 px-3 py-1 text-[13px] font-extrabold tracking-wide uppercase"
                  style={{ fontFamily: art.headingFont, ...art.tab(accent) }}
                >
                  {r.heading}
                </h2>
                <ul className="space-y-3">
                  {r.concepts.map((k, j) => (
                    <li key={j} className="flex items-start gap-3">
                      <span
                        className="shrink-0 rounded-full p-1"
                        style={{
                          background: `color-mix(in srgb, ${accent} 14%, #ffffff)`,
                          border: style === "anime" ? "2px solid #1f2937" : undefined,
                        }}
                      >
                        <Metaphor
                          metaphor={k.metaphor}
                          accent={accent}
                          soft={`color-mix(in srgb, ${accent} 18%, #ffffff)`}
                          size={46}
                        />
                      </span>
                      <span className="min-w-0">
                        {k.value && (
                          <span
                            className="block text-[26px] leading-none font-extrabold"
                            style={{ color: accent, fontFamily: art.headingFont }}
                          >
                            {k.value}
                          </span>
                        )}
                        <span className="block text-[15px] leading-snug font-bold">{k.takeaway}</span>
                      {k.detail && (
                        <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: art.muted }}>
                          {k.detail.replace(/\s*\[\d+\](?:\[\d+\])*/g, "")}
                        </span>
                      )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {c.takeaway && (
          <div
            className="mx-auto mt-8 flex max-w-3xl items-center gap-3 px-5 py-3"
            style={{
              background: art.panel,
              border: `${style === "anime" ? 2 : 1}px solid ${style === "anime" ? art.border : art.accents[0]}`,
              borderRadius: art.radius,
              boxShadow: art.panelShadow,
            }}
          >
            <span
              className="shrink-0 px-2.5 py-1 text-[11px] font-extrabold tracking-wide uppercase"
              style={art.tab(art.accents[0])}
            >
              {isGuide ? "Pro tip" : "Takeaway"}
            </span>
            <span className="text-[15px] font-semibold">
              {c.takeaway.replace(/\s*\[\d+\](?:\[\d+\])*/g, "")}
            </span>
          </div>
        )}

        {isGuide && c.scale && (
          <div className="mt-8 flex items-end justify-center gap-4">
            {c.scale.map((s, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="w-40 rounded-t-xl"
                  style={{
                    height: 26 + i * 26,
                    background: `linear-gradient(180deg, ${art.accents[i % 3]}, color-mix(in srgb, ${art.accents[i % 3]} 55%, #ffffff))`,
                  }}
                />
                <span className="mt-1.5 text-[14px] font-bold">{s.tier}</span>
                <span className="text-[12px]" style={{ color: art.muted }}>
                  {s.figure}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <span
        className="absolute right-4 bottom-3 rounded-full px-3 py-1 text-[12px] font-semibold"
        style={{ background: "rgba(15,23,42,0.78)", color: "#ffffff" }}
      >
        ✨ Layout sketch · your image model draws the final art
      </span>
    </div>
  );
}

/** The example for one style, at full design width. */
export function StyleExample({ style }: { style: InfographicStyle }) {
  return (
    // Sample citations are not real sources, so they render as plain tooltips
    // rather than buttons that would try to open a source.
    <CitationContext.Provider value={null}>
      {isImageStyle(style) ? (
        <ImageStyleSketch style={style} />
      ) : (
        <Infographic content={sampleInfographic(style)} citations={SAMPLE_CITATIONS} />
      )}
    </CitationContext.Provider>
  );
}

/**
 * An example scaled down to fit its container. `crop` keeps a fixed aspect and
 * shows the top of the piece; otherwise the full height is kept.
 */
export function ScaledExample({
  style,
  crop,
  className = "",
}: {
  style: InfographicStyle;
  crop?: boolean;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  const [height, setHeight] = useState(0);

  useIsoLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      const s = o.clientWidth / DESIGN_WIDTH;
      if (s > 0) setScale(s);
      setHeight(i.scrollHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [style]);

  return (
    <div
      ref={outer}
      className={`relative w-full overflow-hidden ${crop ? "aspect-[4/3]" : ""} ${className}`}
      style={crop ? undefined : { height: Math.ceil(height * scale) || undefined }}
      aria-hidden={crop ? true : undefined}
    >
      <div
        ref={inner}
        // Thumbnails are pictures, not controls: nothing inside should take focus.
        inert={crop ? true : undefined}
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: DESIGN_WIDTH, transform: `scale(${scale})` }}
      >
        <StyleExample style={style} />
      </div>
      {crop && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: "linear-gradient(transparent, var(--panel))" }}
        />
      )}
    </div>
  );
}

type Filter = "all" | StyleGroup;

/** The full-screen chooser: every style with an example, and a large preview. */
export default function InfographicGallery({
  value,
  suggestions,
  onPick,
  onGenerate,
  onClose,
  canGenerate,
}: {
  value: InfographicStyle;
  suggestions?: StyleSuggestion[];
  onPick: (style: InfographicStyle) => void;
  onGenerate: (style: InfographicStyle) => void;
  onClose: () => void;
  canGenerate: boolean;
}) {
  const [selected, setSelected] = useState<InfographicStyle>(value);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const selectedRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const { dialogRef, backdropProps } = useDialog(onClose);

  useEffect(() => {
    // Only on open: later selections keep focus where the user put it.
    selectedRef.current?.focus({ preventScroll: false });
  }, []);

  useEffect(() => {
    previewRef.current?.scrollTo({ top: 0 });
  }, [selected]);

  const suggested = useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.style, s.reason])),
    [suggestions]
  );

  const visible = STYLE_ORDER.filter((k) => {
    if (filter !== "all" && STYLE_META[k].group !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const d = INFOGRAPHIC_STYLES[k];
    return `${d.label} ${d.blurb} ${STYLE_META[k].bestFor}`.toLowerCase().includes(q);
  });

  const def = INFOGRAPHIC_STYLES[selected];
  const meta = STYLE_META[selected];
  const image = isImageStyle(selected);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
        className="fade-up flex h-full w-full max-w-7xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:rounded-2xl"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <span className="text-lg" aria-hidden>
            📊
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="gallery-title" className="text-[15px] font-semibold">
              Infographic styles
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              {STYLE_ORDER.length} styles. Every example uses the same sample notebook, so you
              can compare them side by side before you generate.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:grid-rows-1">
          {/* Chooser */}
          <div className="flex min-h-0 flex-col border-b border-[var(--border)] lg:border-r lg:border-b-0">
            <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3 pb-2">
              <div role="tablist" aria-label="Filter styles" className="flex flex-wrap gap-1">
                {(
                  [{ key: "all", label: "All" }, ...STYLE_GROUPS] as { key: Filter; label: string }[]
                ).map((g) => (
                  <button
                    key={g.key}
                    role="tab"
                    aria-selected={filter === g.key}
                    onClick={() => setFilter(g.key)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      filter === g.key
                        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--fg)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:border-line-hover"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                aria-label="Search styles"
                placeholder="Search styles…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="ml-auto w-36 rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none focus:border-focus"
              />
            </div>
            {filter !== "all" && (
              <p className="px-4 pb-2 text-[11px] text-[var(--muted)]">
                {STYLE_GROUPS.find((g) => g.key === filter)?.blurb}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {visible.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-[var(--muted)]">
                  No style matches “{query}”.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {visible.map((k) => {
                    const d = INFOGRAPHIC_STYLES[k];
                    const isSel = k === selected;
                    const why = suggested.get(k);
                    return (
                      <li key={k}>
                        <button
                          ref={isSel ? selectedRef : undefined}
                          type="button"
                          aria-pressed={isSel}
                          data-style={k}
                          onClick={() => setSelected(k)}
                          onDoubleClick={() => {
                            onPick(k);
                            onClose();
                          }}
                          className={`group block w-full overflow-hidden rounded-xl border text-left transition ${
                            isSel
                              ? "border-[var(--accent)] ring-2 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]"
                              : "border-[var(--border)] hover:border-line-hover"
                          }`}
                        >
                          <ScaledExample style={k} crop />
                          <span className="block border-t border-[var(--border)] px-2.5 py-2">
                            <span className="flex items-center gap-1.5 text-[13px] font-medium">
                              <span aria-hidden>{d.icon}</span>
                              <span className="truncate">{d.label}</span>
                              {why && (
                                <span className="ml-auto shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-1.5 py-0.5 text-[10px] text-[var(--fg)]">
                                  Suggested
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
                              {d.blurb}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-[var(--border)] px-5 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                  <span aria-hidden>{def.icon}</span>
                  {def.label}
                  {image && (
                    <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-normal text-[var(--muted)]">
                      Needs an image model
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-[13px] text-[var(--muted)]">
                  {def.blurb}. <span className="text-[var(--fg)]">Best for:</span>{" "}
                  {meta.bestFor.toLowerCase()}.
                </p>
                {suggested.get(selected) && (
                  <p className="mt-1 text-[11px] text-[var(--fg)]">
                    ✨ Suggested for your sources: {suggested.get(selected)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="btn !px-3 !py-1.5 !text-xs"
                  onClick={() => {
                    onPick(selected);
                    onClose();
                  }}
                >
                  Use this style
                </button>
                <button
                  className="btn btn-primary !px-3 !py-1.5 !text-xs"
                  disabled={!canGenerate}
                  title={canGenerate ? undefined : "Select at least one source to generate."}
                  onClick={() => {
                    onPick(selected);
                    onGenerate(selected);
                    onClose();
                  }}
                >
                  Generate
                </button>
              </div>
            </div>
            <div ref={previewRef} className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] p-4 sm:p-5">
              <ScaledExample key={selected} style={selected} />
              <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
                {image
                  ? "A sketch of the layout and art direction. The real picture is drawn by your image model from a cited brief, which is kept beneath it."
                  : "A real rendering of this style on sample content. Yours is written from your selected sources, with clickable citations."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
