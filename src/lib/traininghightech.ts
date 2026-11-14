/**
 * The high-tech (futuristic HUD) look of a composed training video, as pieces
 * that src/lib/traininghyperframes.ts swaps in for the standard ones: a grid,
 * scanline and glow stage, HUD frames and scan sweeps around every visual,
 * glitch arrivals, live kinetic title cards, and a decoded lower third.
 *
 * The slides, pictures and presenter clips are the same files the standard
 * compositor uses; only the frame around them and the cards and lower third
 * (which become live text instead of pictures of text) change. When the
 * animation setting is "none" the style is drawn but nothing moves.
 *
 * Pure and deterministic; see src/lib/hightech.ts.
 */
import type { MotionPalette } from "./motion";
import { esc, num } from "./hyperframesproject";
import {
  HT_MONO,
  HT_SANS,
  bracketsHtml,
  bracketsJs,
  bracketsPulseJs,
  decodeJs,
  glitchJs,
  hightechCss,
  hightechTheme,
  revealJs,
  rgba,
  seedOf,
  spreadHtml,
  spreadJs,
  splitText,
  typeHtml,
  typeJs,
  type HtTheme,
} from "./hightech";
import { fixCase } from "./slidecase";
import { composeVocabulary, type ComposeInput, type TimelineCard } from "./trainingtimeline";

export type TrainingHightech = {
  palette: MotionPalette;
  title: string;
  description?: string;
  sectionTitles: string[];
  presenterName: string;
  presenterRole: string;
};

/** The words the live cards and lower third show, cased the way the slides case them. */
export function trainingHightech(input: ComposeInput, palette: MotionPalette): TrainingHightech {
  const vocab = composeVocabulary(input);
  const c = input.composition;
  return {
    palette,
    title: fixCase(input.title, vocab),
    description: fixCase(input.description, vocab) || undefined,
    sectionTitles: input.sections.map((s) => fixCase(s.title, vocab)),
    presenterName: c.lowerThird.enabled ? c.lowerThird.name.trim() : "",
    presenterRole: c.lowerThird.role,
  };
}

export type HtStage = {
  t: HtTheme;
  W: number;
  H: number;
  S: number;
  total: number;
  /** False when the video's animation setting is "none": styled, but still. */
  animate: boolean;
};

export const htTheme = hightechTheme;

export function htCss(o: HtStage): string {
  const { t, W, H, S } = o;
  const px = (n: number) => `${num(n * S)}px`;
  return `${hightechCss(t, S)}
#stage { background: linear-gradient(180deg, ${t.base}, ${t.deep}); }
#stage > div { position: absolute; inset: 0; }
.cue.ht-cue { border-radius: ${px(6)}; box-shadow: 0 0 ${px(26)} ${rgba(t.a1, 0.3)}; }
.ht-edge { position: absolute; inset: 0; border: ${px(1.5)} solid ${rgba(t.a1, 0.7)}; border-radius: ${px(6)}; pointer-events: none; z-index: 3; }
.ht-sweep { position: absolute; left: 0; width: 100%; height: ${px(3)}; background: linear-gradient(90deg, transparent, ${t.a1}, transparent); opacity: 0; z-index: 3; }
.cue .ht-br { margin: ${px(-7)}; z-index: 3; }
.cap span { background: ${rgba(t.deep, 0.9)}; border: ${px(1)} solid ${rgba(t.a1, 0.5)}; border-left: ${px(4)} solid ${t.a1}; border-radius: ${px(4)}; color: ${t.text}; box-shadow: 0 0 ${px(18)} ${rgba(t.a1, 0.2)}; }
.ht-card { overflow: hidden; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg, ${t.base} 0%, ${t.deep} 100%); }
.ht-cc { position: relative; padding-left: ${num(W * 0.09)}px; }
.ht-eb { font: 700 ${num(H * 0.034)}px/1 ${HT_MONO}; letter-spacing: .3em; text-transform: uppercase; color: ${t.a1}; text-shadow: 0 0 ${px(10)} ${rgba(t.a1, 0.7)}; white-space: nowrap; }
.ht-crule { display: block; width: ${num(W * 0.09)}px; height: ${px(3)}; margin: ${num(H * 0.03)}px 0 ${num(H * 0.04)}px; background: ${t.a2}; box-shadow: 0 0 ${px(10)} ${t.a2}; transform-origin: 0 50%; }
.ht-ct { width: ${num(W * 0.8)}px; font-family: ${HT_MONO}; font-weight: 800; line-height: 1.1; color: ${t.text}; text-shadow: 0 0 ${px(16)} ${rgba(t.a1, 0.45)}; overflow-wrap: anywhere; }
.ht-ct .w { display: inline-block; white-space: nowrap; }
.ht-ct .ch { display: inline-block; }
.ht-cs { margin-top: ${num(H * 0.04)}px; max-width: ${num(W * 0.66)}px; font: 500 ${num(H * 0.038)}px/1.35 ${HT_SANS}; color: ${t.text}; }
.ht-cnum { position: absolute; right: ${num(W * 0.07)}px; top: 50%; transform: translateY(-50%); font: 800 ${num(H * 0.36)}px/1 ${HT_MONO}; color: ${rgba(t.a1, 0.16)}; }
.ht-lower { display: flex; align-items: stretch; overflow: hidden; background: ${rgba(t.deep, 0.92)}; border: ${px(1.5)} solid ${rgba(t.a1, 0.6)}; border-radius: ${px(6)}; box-shadow: 0 0 ${px(22)} ${rgba(t.a1, 0.25)}; }
.ht-lbar { width: ${px(5)}; background: ${t.a2}; box-shadow: 0 0 ${px(10)} ${t.a2}; transform-origin: 50% 0; }
.ht-lin { flex: 1; min-width: 0; padding: 0 ${num(H * 0.015)}px 0 ${num(H * 0.02)}px; display: flex; flex-direction: column; justify-content: center; }
.ht-fit { overflow: hidden; white-space: nowrap; }
.ht-ln { font-family: ${HT_MONO}; font-weight: 800; line-height: 1.1; color: ${t.text}; }
.ht-lr { margin-top: ${px(5)}; font-family: ${HT_SANS}; font-weight: 600; line-height: 1.2; color: ${t.a1}; }
#hud { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 35; pointer-events: none; }
`;
}

/** Shrinks live text that would overflow, before the timeline is built. */
export const HT_FIT = `
document.querySelectorAll(".ht-fit").forEach(function (el) {
  var s = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 1 && s > 10) { s -= 1; el.style.fontSize = s + "px"; }
});
document.querySelectorAll(".ht-ct").forEach(function (el) {
  var s = parseFloat(getComputedStyle(el).fontSize), max = +el.dataset.max;
  function wide() { var w = 0; el.querySelectorAll(".w").forEach(function (x) { w = Math.max(w, x.getBoundingClientRect().width); }); return w > el.getBoundingClientRect().width + 1; }
  while ((el.getBoundingClientRect().height > max || wide()) && s > 20) { s -= 2; el.style.fontSize = s + "px"; }
});`;

/** The stage: a grid that drifts, a glow, scanlines and a vignette. */
export function htStage(o: HtStage, js: string[]): string {
  const { S, total, animate } = o;
  const cell = 48 * S;
  if (animate) {
    js.push(
      `tl.fromTo("#stagegrid",{backgroundPosition:"0px 0px"},{backgroundPosition:"0px ${num(cell * Math.max(1, Math.round(total / 6)))}px",duration:${num(total)},ease:"none"},0);`,
    );
  }
  return `<div id="stage"><div id="stagegrid" class="ht-grid"></div><div class="ht-glow"></div><div class="ht-scan"></div><div class="ht-vig"></div></div>`;
}

/** The frame-wide corner brackets. */
export function htHud(o: HtStage, js: string[]): string {
  const inset = num(8 * o.S);
  bracketsJs(js, "hud", 0.1, o.animate);
  if (o.animate) bracketsPulseJs(js, "hud", 1.2, o.total - 0.8);
  return `<div id="hud"><div style="position:absolute;left:${inset}px;top:${inset}px;right:${inset}px;bottom:${inset}px">${bracketsHtml("hud")}</div></div>`;
}

/**
 * The frame around a visual's panel: a neon edge, corner brackets that draw
 * in, and a scan line that sweeps down it as it arrives.
 */
export function htCueChrome(
  id: string,
  size: { w: number; h: number },
  full: boolean,
  start: number,
  entering: boolean,
  o: HtStage,
  js: string[],
): string {
  const { S } = o;
  const inset = full ? `margin:${num(22 * S)}px;` : "";
  bracketsJs(js, `${id}b`, start + (entering ? 0.15 : 0), entering);
  if (entering) {
    js.push(
      `tl.fromTo("#${id}n",{y:0,opacity:1},{y:${size.h},opacity:1,duration:0.7,ease:"power2.inOut"},${num(start + 0.1)});`,
      `tl.set("#${id}n",{opacity:0},${num(start + 0.8)});`,
    );
  }
  return `${full ? "" : `<i class="ht-edge"></i>`}${bracketsHtml(`${id}b`, inset)}<i id="${id}n" class="ht-sweep"></i>`;
}

/** A chromatic glitch arrival for an element. */
export function htArrive(id: string, at: number, dur: number, o: HtStage, js: string[]): void {
  js.push(...glitchJs(`"#${id}"`, at, dur, seedOf("arrive", id), o.W, o.S));
}

const EYEBROW = { intro: "Training", outro: "Session complete" } as const;

/**
 * A title, section or closing card drawn as live text: a decoded eyebrow,
 * a rule that wipes in, a title that reveals letter by letter, and a typed line.
 */
export function htCard(
  n: number,
  k: TimelineCard,
  text: TrainingHightech,
  timed: string,
  fade: number,
  o: HtStage,
  js: string[],
): string {
  const { W, H, S, total, animate, t } = o;
  const id = `card${n}`;
  const i = k.section ?? 0;
  const eyebrow = k.role === "section" ? `Part ${i + 1} of ${text.sectionTitles.length}` : EYEBROW[k.role];
  const heading = k.role === "section" ? text.sectionTitles[i] || "Next" : text.title;
  const sub = k.role === "intro" ? text.description : k.role === "outro" ? "Thank you for learning with us." : undefined;
  const size = Math.round(H * (k.role === "section" ? 0.1 : 0.09));
  const at = k.start;

  const split = animate ? splitText(`${id}t`, heading) : null;
  if (animate && split) {
    js.push(
      `tl.fromTo("#${id}r",{scaleX:0},{scaleX:1,duration:0.5,ease:"power3.out"},${num(at + 0.3)});`,
    );
    spreadJs(js, `${id}e`, eyebrow, at + 0.15, 0.7, 7 * S);
    revealJs(js, split, (w) => at + 0.35 + w * 0.09, S, seedOf("card-title", id, heading));
    if (sub) {
      const lead = at + 0.35 + split.words.length * 0.09 + 0.3;
      const room = Math.max(0.8, Math.min(1.6, k.duration - (lead - at) - 0.3));
      js.push(...typeJs({ on: `${id}so`, off: `${id}sf`, cursor: `${id}su` }, sub, lead, Math.max(30, [...sub].length / room), 0.5));
    }
    if (k.role === "section") js.push(...decodeJs(`${id}m`, String(i + 1).padStart(2, "0"), at + 0.2, 0.6, seedOf("num", i)));
    bracketsJs(js, `${id}b`, at + 0.05, true);
  } else {
    bracketsJs(js, `${id}b`, at, false);
  }
  if (animate && fade > 0 && at > 0.01) js.push(...glitchJs(`"#${id}"`, at, 0.35, seedOf("card-glitch", id), W, S));
  if (animate && fade > 0 && at + k.duration < total - 0.01) {
    js.push(`tl.to("#${id}",{opacity:0,duration:${fade},ease:"none"},${num(at + k.duration - fade)});`);
  }

  const inset = num(H * 0.06);
  const titleHtml = split ? split.html : esc(heading);
  const subHtml = sub ? `<div class="ht-cs">${animate ? typeHtml(`${id}s`, sub, t.a2) : esc(sub)}</div>` : "";
  return (
    `<div id="${id}" class="card ht-card" ${timed} style="z-index:50">` +
    `<div class="ht-grid"></div><div class="ht-glow"></div><div class="ht-scan"></div><div class="ht-vig"></div>` +
    `<div style="position:absolute;left:${inset}px;top:${inset}px;right:${inset}px;bottom:${inset}px">${bracketsHtml(`${id}b`, animate ? "" : "opacity:1;")}</div>` +
    (k.role === "section" ? `<div id="${id}m" class="ht-cnum">${String(i + 1).padStart(2, "0")}</div>` : "") +
    `<div class="ht-cc"><div id="${id}e" class="ht-eb">${animate ? spreadHtml(`${id}e`, eyebrow) : esc(eyebrow)}</div><i id="${id}r" class="ht-crule"></i>` +
    `<div class="ht-ct" data-max="${num(H * 0.42)}" style="font-size:${size}px">${titleHtml}</div>${subHtml}</div></div>`
  );
}

/** The presenter's name and role as live text, decoded and typed in beside them. */
export function htLower(
  lt: { start: number; end: number },
  name: string,
  role: string,
  rectStyle: string,
  rectH: number,
  timed: string,
  lowerIn: number,
  o: HtStage,
  js: string[],
): string {
  const { S, animate } = o;
  const id = "lower";
  const nameSize = Math.round(rectH * 0.3);
  const roleSize = Math.round(rectH * 0.19);
  if (animate && lowerIn > 0) {
    js.push(
      ...glitchJs(`"#${id}"`, lt.start, 0.4, seedOf("lower-glitch", name), o.W, S),
      `tl.fromTo("#${id}b",{scaleY:0},{scaleY:1,duration:0.4,ease:"power3.out"},${num(lt.start)});`,
      ...decodeJs(`${id}n`, name, lt.start + 0.1, 0.5, seedOf("lower-name", name)),
    );
    if (role) js.push(...typeJs({ on: `${id}ro`, off: `${id}rf`, cursor: `${id}ru` }, role, lt.start + 0.5, 28, 0.5));
  }
  const typed = animate && lowerIn > 0;
  return (
    `<div id="${id}" class="lower ht-lower" ${timed} style="${rectStyle}">` +
    `<i id="${id}b" class="ht-lbar"></i><div class="ht-lin">` +
    `<div id="${id}n" class="ht-ln ht-fit" style="font-size:${nameSize}px">${esc(name)}</div>` +
    (role ? `<div class="ht-lr ht-fit" style="font-size:${roleSize}px">${typed ? typeHtml(`${id}r`, role, o.t.a2) : esc(role)}</div>` : "") +
    `</div></div>`
  );
}
