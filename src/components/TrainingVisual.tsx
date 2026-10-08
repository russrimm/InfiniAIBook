"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Infographic from "./Infographic";
import type { MotionPalette } from "@/lib/motion";
import type { InfographicContent } from "@/lib/types";
import { TEXT_PICTURE_KINDS, type TrainingCue } from "@/lib/trainingvisuals";
import { cueBullets, type RasterJob } from "@/lib/trainingtimeline";
import { casedCue, fixCase, type CaseVocabulary } from "@/lib/slidecase";

/**
 * Every picture a composed training video shows, drawn at its exact pixel
 * size. The preview renders these live; before a render the browser turns
 * each one (and each build state) into a PNG for the compositor, so the
 * preview and the MP4 cannot disagree.
 *
 * Sizes are in "u", 1% of the panel's height, so one design fits the side
 * panel, the wide picture-in-picture panel and the full frame.
 */

export type VisualContext = {
  title: string;
  description?: string;
  objectives: string[];
  sectionTitle?: string;
  sectionIndex?: number;
  sectionCount?: number;
  lowerName?: string;
  lowerRole?: string;
  /** How the script writes its names, so slide text is capitalized to match. */
  vocab?: CaseVocabulary;
};

type Props = {
  role: RasterJob["role"];
  width: number;
  height: number;
  state: number;
  palette: MotionPalette;
  cue?: TrainingCue;
  ctx: VisualContext;
  infographic?: InfographicContent | null;
  /** Square corners, for a card drawn inside another one. */
  flat?: boolean;
};

const FONT = `var(--font-geist-sans), "Segoe UI", system-ui, sans-serif`;

/** Citation markers mean nothing in a video frame. */
export function stripCitations<T>(v: T): T {
  if (typeof v === "string") return v.replace(/\s?\[\d+\](?:\[\d+\])*/g, "") as T;
  if (Array.isArray(v)) return v.map(stripCitations) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripCitations(x)])) as T;
  }
  return v;
}

function Frame({
  width,
  height,
  children,
  style,
  radius = true,
}: {
  width: number;
  height: number;
  children: ReactNode;
  style?: CSSProperties;
  radius?: boolean;
}) {
  const u = height / 100;
  return (
    <div
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: radius ? u * 2.6 : 0,
        fontFamily: FONT,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FitInfographic({ content, width, height }: { content: InfographicContent; width: number; height: number }) {
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const natural = 1100;
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const fit = () => setScale(Math.min(width / natural, height / Math.max(1, el.scrollHeight)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div style={{ width, height, display: "flex", justifyContent: "center", alignItems: "flex-start", overflow: "hidden" }}>
      <div
        ref={inner}
        className="bg-[#0e1116] text-[#e7ebf0]"
        style={{ width: natural, transform: `scale(${scale})`, transformOrigin: "top center", flexShrink: 0 }}
      >
        <Infographic content={stripCitations(content)} />
      </div>
    </div>
  );
}

/**
 * A visual's picture. Screenshots are shown whole, over a blurred copy of
 * themselves so the spare space is not a flat bar; illustrations fill the area.
 */
export function Picture({
  cue,
  palette: p,
  u,
  credit = true,
}: {
  cue: TrainingCue;
  palette: MotionPalette;
  u: number;
  /** Show where the picture came from. */
  credit?: boolean;
}) {
  const shot = cue.kind === "screenshot" || Boolean(cue.imageCredit);
  const src = `/api/image/${cue.imageId}`;
  const alt = cue.caption || cue.title || (shot ? "Screenshot" : "Illustration");
  // Plain <img>s: the rasterizer needs the bytes inline, which next/image would not give it.
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: shot ? "#0f141b" : p.dark }}>
      {shot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `blur(${Math.max(6, u * 3)}px) brightness(0.55)`,
            transform: "scale(1.15)",
          }}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          position: "absolute",
          inset: shot ? u * 3 : 0,
          width: shot ? `calc(100% - ${u * 6}px)` : "100%",
          height: shot ? `calc(100% - ${u * 6}px)` : "100%",
          objectFit: shot ? "contain" : "cover",
          display: "block",
        }}
      />
      {credit && cue.imageCredit && (
        <div
          style={{
            position: "absolute",
            top: u * 1.6,
            right: u * 1.6,
            padding: `${u * 0.5}px ${u * 1.2}px`,
            borderRadius: u * 0.8,
            background: "rgba(10,12,16,0.72)",
            color: "#f4f6f8",
            fontSize: Math.max(10, u * 2.2),
            fontWeight: 600,
            letterSpacing: 0.2,
          }}
        >
          {cue.imageCredit}
        </div>
      )}
    </div>
  );
}

export default function TrainingVisual({ role, width, height, state, palette: p, cue: rawCue, ctx, infographic, flat }: Props) {
  const u = height / 100;
  const wide = width / height;
  // The narrow side panel needs smaller type than the wide one.
  const t = Math.min(1, wide / 1.55) * u;
  const fx = (s: string | undefined) => fixCase(s, ctx.vocab);

  if (role === "intro" || role === "outro" || role === "section") {
    const eyebrow =
      role === "intro"
        ? "Training"
        : role === "outro"
          ? "Session complete"
          : `Part ${(ctx.sectionIndex ?? 0) + 1} of ${ctx.sectionCount ?? 1}`;
    const heading = fx(role === "section" ? ctx.sectionTitle || "Next" : ctx.title);
    const sub =
      role === "intro" ? fx(ctx.description) : role === "outro" ? "Thank you for learning with us." : undefined;
    return (
      <Frame
        width={width}
        height={height}
        radius={false}
        style={{
          background: `linear-gradient(135deg, ${p.dark} 0%, ${p.dark} 45%, ${p.primary} 140%)`,
          color: p.light,
          padding: `${u * 14}px ${u * 12}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -u * 18,
            top: -u * 22,
            width: u * 80,
            height: u * 80,
            borderRadius: "50%",
            background: p.primary,
            opacity: 0.22,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: u * 10,
            bottom: -u * 30,
            width: u * 55,
            height: u * 55,
            borderRadius: "50%",
            background: p.accent,
            opacity: 0.16,
          }}
        />
        <div style={{ fontSize: u * 3.6, letterSpacing: u * 0.5, textTransform: "uppercase", color: p.accent, fontWeight: 700 }}>
          {eyebrow}
        </div>
        <div style={{ width: u * 9, height: u * 0.9, background: p.accent, margin: `${u * 3}px 0 ${u * 4}px` }} />
        <div style={{ fontSize: u * (role === "section" ? 10 : 9), fontWeight: 750, lineHeight: 1.08, maxWidth: "78%" }}>
          {heading}
        </div>
        {sub && (
          <div style={{ fontSize: u * 3.8, marginTop: u * 4, opacity: 0.85, maxWidth: "70%", lineHeight: 1.35 }}>{sub}</div>
        )}
      </Frame>
    );
  }

  if (role === "lower") {
    return (
      <Frame
        width={width}
        height={height}
        style={{ background: p.light, display: "flex", alignItems: "stretch", boxShadow: "none" }}
      >
        <div style={{ width: u * 5, background: p.accent }} />
        <div style={{ padding: `${u * 9}px ${u * 12}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: u * 30, fontWeight: 750, color: p.dark, lineHeight: 1.05 }}>{ctx.lowerName}</div>
          {ctx.lowerRole && (
            <div style={{ fontSize: u * 19, color: p.primary, marginTop: u * 5, fontWeight: 600 }}>{ctx.lowerRole}</div>
          )}
        </div>
      </Frame>
    );
  }

  if (!rawCue) return <Frame width={width} height={height} radius={!flat}><span /></Frame>;
  const cue = casedCue(rawCue, ctx.vocab);

  // Text visuals with a picture: the picture beside the words on a wide panel,
  // above them on the narrower side panel.
  if (cue.imageId && TEXT_PICTURE_KINDS.includes(cue.kind)) {
    const beside = wide >= 1.5;
    const pw = beside ? Math.round(width * 0.45) : width;
    const ph = beside ? height : Math.round(height * 0.42);
    const tw = beside ? width - pw : width;
    const th = beside ? height : height - ph;
    return (
      <Frame width={width} height={height} radius={!flat} style={{ background: p.light }}>
        <div style={{ position: "absolute", left: beside ? tw : 0, top: 0, width: pw, height: ph }}>
          <Picture cue={cue} palette={p} u={u} />
        </div>
        <div style={{ position: "absolute", left: 0, top: beside ? 0 : ph, width: tw, height: th }}>
          <TrainingVisual
            role="cue"
            width={tw}
            height={th}
            state={state}
            palette={p}
            cue={{ ...cue, imageId: undefined }}
            ctx={ctx}
            flat
          />
        </div>
      </Frame>
    );
  }

  const card: CSSProperties = {
    background: p.light,
    color: p.dark,
    padding: `${u * 7}px ${u * 7.5}px`,
    display: "flex",
    flexDirection: "column",
  };
  const accentBar = (
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: u * 1.4, background: p.primary }} />
  );
  const heading = (text?: string, eyebrow?: string) => (
    <>
      {eyebrow && (
        <div style={{ fontSize: t * 3.8, letterSpacing: t * 0.35, textTransform: "uppercase", fontWeight: 700, color: p.primary }}>
          {eyebrow}
        </div>
      )}
      {text && (
        <div style={{ fontSize: t * 8.4, fontWeight: 750, lineHeight: 1.12, marginTop: eyebrow ? u * 1.8 : 0 }}>{text}</div>
      )}
    </>
  );

  switch (cue.kind) {
    case "title":
      return (
        <Frame
          width={width}
          height={height}
          radius={!flat}
          style={{
            ...card,
            background: `linear-gradient(140deg, ${p.dark}, ${p.primary})`,
            color: p.light,
            justifyContent: "center",
            padding: `${u * 10}px ${u * 9}px`,
          }}
        >
          <div style={{ width: u * 8, height: u * 1, background: p.accent, marginBottom: u * 4 }} />
          <div style={{ fontSize: t * 10, fontWeight: 780, lineHeight: 1.06 }}>{cue.title}</div>
          {cue.subtitle && <div style={{ fontSize: t * 4.4, marginTop: u * 4, opacity: 0.88, lineHeight: 1.35 }}>{cue.subtitle}</div>}
        </Frame>
      );

    case "bullets":
    case "objectives": {
      const bullets = cueBullets(cue, ctx.objectives.map((o) => fx(o) ?? o));
      const numbered = cue.kind === "objectives";
      const size = bullets.length <= 3 ? 7 : bullets.length <= 5 ? 6 : 5.2;
      return (
        <Frame width={width} height={height} radius={!flat} style={{ ...card, justifyContent: "center" }}>
          {accentBar}
          {heading(cue.title ?? (numbered ? "What you will learn" : undefined), numbered ? "Learning objectives" : undefined)}
          <div style={{ marginTop: u * 6, display: "flex", flexDirection: "column", gap: u * 4.2 }}>
            {bullets.map((b, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: u * 2.6,
                  fontSize: t * size,
                  lineHeight: 1.3,
                  // Hidden, not removed, so revealing one never moves the others.
                  visibility: i < state ? "visible" : "hidden",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: t * size * 1.25,
                    height: t * size * 1.25,
                    borderRadius: "50%",
                    background: numbered ? p.primary : "transparent",
                    border: numbered ? "none" : `${u * 0.7}px solid ${p.accent}`,
                    color: p.light,
                    fontSize: t * size * 0.62,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: t * size * 0.04,
                    boxSizing: "border-box",
                  }}
                >
                  {numbered ? i + 1 : ""}
                </span>
                <span style={{ fontWeight: 560 }}>{b.text}</span>
              </div>
            ))}
          </div>
        </Frame>
      );
    }

    case "stat":
      return (
        <Frame width={width} height={height} radius={!flat} style={{ ...card, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          {accentBar}
          {cue.title && <div style={{ fontSize: t * 4.4, fontWeight: 650, color: p.primary, marginBottom: u * 2 }}>{cue.title}</div>}
          <div style={{ fontSize: t * 24, fontWeight: 800, color: p.accent, lineHeight: 1, letterSpacing: -t * 0.4 }}>
            {cue.stat?.value}
          </div>
          <div style={{ fontSize: t * 5.4, fontWeight: 600, marginTop: u * 3, maxWidth: "85%", lineHeight: 1.3 }}>{cue.stat?.label}</div>
        </Frame>
      );

    case "quote":
      return (
        <Frame width={width} height={height} radius={!flat} style={{ ...card, justifyContent: "center", background: p.dark, color: p.light }}>
          <div style={{ fontSize: t * 24, lineHeight: 0.6, color: p.accent, fontWeight: 800, height: t * 10 }}>“</div>
          <div style={{ fontSize: t * 6.4, fontWeight: 620, lineHeight: 1.3 }}>{cue.quote?.text}</div>
          {cue.quote?.attribution && (
            <div style={{ fontSize: t * 3.8, marginTop: u * 4, color: p.accent, fontWeight: 600 }}>— {cue.quote.attribution}</div>
          )}
        </Frame>
      );

    case "check":
      return (
        <Frame width={width} height={height} radius={!flat} style={{ ...card, justifyContent: "center" }}>
          {accentBar}
          {heading(undefined, "Knowledge check")}
          <div style={{ fontSize: t * 6.4, fontWeight: 700, lineHeight: 1.25, marginTop: u * 2.5 }}>{cue.question}</div>
          {cue.answer && (
            <div
              style={{
                marginTop: u * 5,
                padding: `${u * 3.2}px ${u * 4}px`,
                borderRadius: u * 2,
                background: p.primary,
                color: p.light,
                fontSize: t * 4.6,
                lineHeight: 1.35,
                visibility: state >= 1 ? "visible" : "hidden",
              }}
            >
              <div style={{ fontSize: t * 3, letterSpacing: t * 0.3, textTransform: "uppercase", fontWeight: 700, opacity: 0.85 }}>
                Answer
              </div>
              <div style={{ marginTop: u * 1, fontWeight: 600 }}>{cue.answer}</div>
            </div>
          )}
        </Frame>
      );

    case "image":
    case "screenshot": {
      const shot = cue.kind === "screenshot";
      return (
        <Frame width={width} height={height} radius={!flat} style={{ background: shot ? "#0f141b" : p.dark }}>
          {cue.imageId ? (
            <Picture cue={cue} palette={p} u={u} />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: p.light,
                gap: u * 2,
                padding: u * 8,
                textAlign: "center",
                background: `linear-gradient(140deg, ${p.dark}, ${p.primary})`,
              }}
            >
              <div style={{ fontSize: t * 4.6, fontWeight: 650, lineHeight: 1.3 }}>
                {cue.caption || cue.title || (shot ? "Add a screenshot" : "Picture not generated yet")}
              </div>
            </div>
          )}
          {cue.imageId && (cue.caption || cue.title) && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: `${u * 3}px ${u * 4.5}px`,
                background: `linear-gradient(transparent, ${p.dark}EE)`,
                color: p.light,
                fontSize: t * 4.2,
                fontWeight: 620,
              }}
            >
              {cue.caption || cue.title}
            </div>
          )}
        </Frame>
      );
    }

    case "infographic":
      return (
        <Frame width={width} height={height} radius={!flat} style={{ background: "#0e1116" }}>
          {infographic ? (
            <FitInfographic content={infographic} width={width} height={height} />
          ) : (
            <div style={{ ...card, height: "100%", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              {heading(cue.title || "Choose an infographic", "Infographic")}
            </div>
          )}
        </Frame>
      );

    default:
      return <Frame width={width} height={height} radius={!flat}><span /></Frame>;
  }
}
