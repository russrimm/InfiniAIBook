/**
 * The high-tech (futuristic HUD) look of a motion explainer, as pieces that
 * src/lib/motionhyperframes.ts swaps in for the standard ones: split-text and
 * decoded headlines, typewriter sublines, neon chips with animated borders,
 * counting stat cards, glitch transitions, HUD frames and scanline backdrops.
 *
 * Text colors never come from the palette: panels are always dark glass and
 * type is always near-white, so any palette (including a custom one) stays legible.
 * Pure and deterministic; see src/lib/hightech.ts.
 */
import type { ChipsLayer, HeadlineLayer, RenderConfig, RenderScene, StatLayer, SublineLayer } from "./motiontimeline";
import { esc, num } from "./hyperframesproject";
import {
  HT_MONO,
  HT_SANS,
  bracketsHtml,
  bracketsJs,
  bracketsPulseJs,
  decodeJs,
  glitchBarsHtml,
  glitchBarsJs,
  glitchJs,
  hightechCss,
  jsStr,
  neon,
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
import { NUMBER, statText } from "./statcount";

type Time = (t: number) => number;

export function htCss(t: HtTheme, S: number): string {
  const px = (n: number) => `${num(n * S)}px`;
  return `${hightechCss(t, S)}
.hlt { font-family: ${HT_MONO}; font-weight: 800; color: ${t.text}; text-shadow: 0 0 ${px(14)} ${rgba(t.a1, 0.5)}; letter-spacing: .01em; }
.hlt .w { white-space: nowrap; }
.hlt .ch { display: inline-block; }
.ht-glass { background: ${rgba(t.deep, 0.86)}; border: ${px(1.5)} solid ${rgba(t.a1, 0.7)}; border-radius: ${px(6)}; box-shadow: 0 0 ${px(26)} ${rgba(t.a1, 0.28)}, inset 0 0 ${px(18)} ${rgba(t.a1, 0.12)}; }
.hlp.ht-glass[data-panel="0"] { background: transparent; border-color: transparent; box-shadow: none; }
.hlp .ht-br, .statc .ht-br { margin: ${px(-7)}; }
.ht-rule { position: absolute; left: 0; right: 0; bottom: 0; height: ${px(2.5)}; background: ${t.a2}; box-shadow: 0 0 ${px(10)} ${t.a2}; transform-origin: 0 50%; }
.subp.ht-sub { background: ${rgba(t.deep, 0.84)}; border-left: ${px(3)} solid ${t.a2}; border-radius: ${px(4)}; }
.subt { font-family: ${HT_SANS}; font-weight: 500; color: ${t.text}; }
.ht-chip { position: relative; overflow: hidden; border-radius: ${px(8)}; padding: ${px(2.5)}; }
.ht-spin { position: absolute; left: 50%; top: 50%; width: ${px(900)}; height: ${px(900)}; margin: ${px(-450)} 0 0 ${px(-450)}; }
.ht-in { position: relative; display: block; border-radius: ${px(6)}; background: ${rgba(t.deep, 0.95)}; color: ${t.text}; font: 700 1em/1.2 ${HT_MONO}; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
.statv { font-family: ${HT_MONO}; font-weight: 800; text-shadow: 0 0 ${px(18)} ${rgba(t.a2, 0.65)}; }
.statl { font-family: ${HT_MONO}; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
.statc.ht-glass { border-radius: ${px(8)}; }
.ht-hud { position: absolute; left: 0; top: 0; pointer-events: none; }
`;
}

/** The backdrop and scene counter that sit between a scene's picture and its text. */
export function htSceneChrome(i: number, total: number, S: number, T: Time, js: string[], t: HtTheme): string {
  const label = `SCENE ${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  spreadJs(js, `s${i}t`, label, T(0.2), 0.7, 5 * S);
  return (
    `<div class="ht-grid"></div><div class="ht-glow"></div><div class="ht-scan"></div><div class="ht-vig"></div>` +
    `<div id="s${i}t" class="ht-tag" style="left:${num(64 * S)}px;top:${num(14 * S)}px;color:${t.a1}">${spreadHtml(`s${i}t`, label)}</div>`
  );
}

export function htHeadline(h: HeadlineLayer, id: string, W: number, S: number, T: Time, js: string[]): string {
  const split = splitText(id, h.words.map((w) => w.text).join(" "));
  const first = h.words.length ? Math.min(...h.words.map((w) => w.at)) : 0;
  const padX = h.panel ? h.size * 0.5 : 0;
  const padY = h.panel ? h.size * 0.18 : 0;
  revealJs(js, split, (k) => T(h.words[k]?.at ?? first), S, seedOf("headline", id, split.html));
  bracketsJs(js, `${id}b`, T(Math.max(0, first - 0.1)), true);
  js.push(
    `tl.fromTo("#${id}p",{opacity:0,scaleX:0.6},{opacity:1,scaleX:1,duration:0.3,ease:"power3.out"},${T(Math.max(0, first - 0.15))});`,
    `tl.fromTo("#${id}r",{scaleX:0},{scaleX:1,duration:0.6,ease:"power3.out"},${T(first + 0.1)});`,
  );
  return (
    `<div class="hl" style="top:${h.y}px"><div id="${id}p" class="hlp ht-glass" data-panel="${h.panel ? 2 : 0}" style="padding:${num(padY)}px ${num(padX)}px">` +
    `${bracketsHtml(`${id}b`)}<div id="${id}" class="hlt" data-size="${h.size}" data-lines="1" style="font-size:${h.size}px;max-width:${num(W * 0.84)}px">${split.html}</div><i id="${id}r" class="ht-rule"></i></div></div>`
  );
}

export function htSubline(s: SublineLayer, id: string, S: number, T: Time, js: string[], t: HtTheme): string {
  const len = [...s.text].length;
  const cps = Math.min(48, Math.max(24, len));
  js.push(
    `tl.set("#${id}p",{opacity:1},${T(s.at)});`,
    ...typeJs({ on: `${id}to`, off: `${id}tf`, cursor: `${id}tu` }, s.text, T(s.at), cps, 1.5),
  );
  return (
    `<div class="sub" style="top:${s.y}px"><div id="${id}p" class="subp ht-sub" style="opacity:0;padding:${num(6 * S)}px ${num(14 * S)}px">` +
    `<span id="${id}" class="subt" data-size="${s.size}" style="font-size:${s.size}px">${typeHtml(`${id}t`, s.text, t.a2)}</span></div></div>`
  );
}

export function htChips(c: ChipsLayer, id: string, S: number, T: Time, js: string[], end: number): string {
  const chips = c.items
    .map((item, k) => {
      const col = neon(item.fill);
      const at = T(item.at);
      const rest = Math.max(1, end - item.at);
      js.push(
        `tl.fromTo("#${id}c${k}",{scale:0.6},{scale:1,duration:0.45,ease:"back.out(1.70158)"},${at});`,
        `tl.fromTo("#${id}c${k}",{opacity:0},{opacity:1,duration:0.25,ease:"none"},${at});`,
        `tl.fromTo("#${id}c${k}s",{rotation:0},{rotation:${360 * Math.max(1, Math.round(rest / 2.5))},duration:${num(rest)},ease:"none"},${at});`,
        ...decodeJs(`${id}c${k}t`, item.text, at, 0.5, seedOf("chip", id, k, item.text)),
      );
      return (
        `<span id="${id}c${k}" class="chip ht-chip" style="opacity:0;background:${rgba(col, 0.32)}">` +
        `<i id="${id}c${k}s" class="ht-spin" style="background:conic-gradient(from 0deg,transparent 0 60%,${col} 100%)"></i>` +
        `<span id="${id}c${k}t" class="ht-in" style="padding:${num(8 * S)}px ${num(15 * S)}px">${esc(item.text)}</span></span>`
      );
    })
    .join("");
  return `<div id="${id}" class="chips" data-size="${c.size}" data-gap="${num(14 * S)}" style="top:${c.y}px;gap:${num(14 * S)}px;font-size:${c.size}px">${chips}</div>`;
}

export function htStat(s: StatLayer, id: string, S: number, T: Time, js: string[], t: HtTheme): string {
  const small = Math.max(14, Math.trunc(s.size * 0.3));
  js.push(
    `tl.fromTo("#${id}c",{scale:0.7},{scale:1,duration:0.5,ease:"back.out(1.70158)"},${T(s.at)});`,
    `tl.fromTo("#${id}c",{opacity:0},{opacity:1,duration:0.333,ease:"none"},${T(s.at)});`,
    `tl.set("#${id}v",{opacity:1},${T(s.at + 0.2)});`,
    `tl.set("#${id}l",{opacity:1},${T(s.at + 0.2)});`,
    ...decodeJs(`${id}l`, s.label, T(s.at + 0.2), 0.6, seedOf("stat", id, s.label)),
  );
  bracketsJs(js, `${id}b`, T(s.at), true);
  // The number counts up for a second, a step every 1/30 s.
  if (NUMBER.test(s.value)) {
    for (let step = 0; step <= 30; step++) {
      js.push(`tl.set("#${id}v",{textContent:${jsStr(statText(s.value, step / 30))}},${T(s.at + 0.2 + step / 30)});`);
    }
  }
  return (
    `<div class="stat" style="left:${s.cx}px;top:${s.cy}px">` +
    `<div id="${id}c" class="statc ht-glass" data-size="${s.size}" style="padding:${num(22 * S)}px ${num(28 * S)}px;opacity:0">` +
    `${bracketsHtml(`${id}b`)}<div id="${id}v" class="statv" style="font-size:${s.size}px;color:${t.a2};opacity:0">${esc(s.value)}</div>` +
    `<div id="${id}l" class="statl" style="font-size:${small}px;color:${t.dim};margin-top:${num(12 * S)}px;opacity:0">${esc(s.label)}</div></div></div>`
  );
}

/**
 * How scene `i` arrives: a glitch burst with a red/cyan channel split and
 * neon bars. A wipe stays a wipe (with a neon bar); the caller draws it.
 */
export function htTransition(
  i: number,
  sc: RenderScene,
  z: number,
  W: number,
  H: number,
  S: number,
  html: string[],
  js: string[],
  t: HtTheme,
): void {
  const d = sc.transition.duration;
  html.push(`<div class="ht-hud" style="z-index:${z + 1};width:${W}px;height:${H}px">${glitchBarsHtml(`x${i}`, 2, H, S)}</div>`);
  js.push(`tl.set("#s${i}",{opacity:0},0);`, ...glitchJs(`"#s${i}"`, sc.start, d, seedOf("scene-glitch", i), W, S));
  glitchBarsJs(js, `x${i}`, 2, sc.start, d, seedOf("scene-bars", i), H, [t.a1, t.a3]);
}

/** The frame-wide HUD: corner brackets that draw in and pulse, and a faint scan beam. */
export function htOverlay(cfg: RenderConfig, S: number, js: string[], t: HtTheme): string {
  const { width: W, height: H, duration: total } = cfg;
  const inset = num(16 * S);
  const beam = num(H * 0.18);
  bracketsJs(js, "hud", 0.1, true);
  bracketsPulseJs(js, "hud", 1.2, total - 0.8);
  for (let at = 2, n = 0; at + 3.2 <= total; at += 5.5, n++) {
    js.push(
      `tl.fromTo("#hudbeam",{y:${-beam},opacity:1},{y:${H},opacity:1,duration:3.2,ease:"none"${n ? ",immediateRender:false" : ""}},${num(at)});`,
      `tl.set("#hudbeam",{opacity:0},${num(at + 3.2)});`,
    );
  }
  return (
    `<div id="hud" class="ht-hud" style="z-index:5000;width:${W}px;height:${H}px">` +
    `<i id="hudbeam" class="ht-beam" style="top:0;height:${beam}px"></i>` +
    `<div style="position:absolute;left:${inset}px;top:${inset}px;right:${inset}px;bottom:${inset}px;color:${t.a1}">${bracketsHtml("hud")}</div></div>`
  );
}
