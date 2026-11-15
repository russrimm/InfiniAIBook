/**
 * Building blocks of the high-tech (futuristic HUD) style that the HyperFrames
 * compositions share: a neon theme derived from the palette, scanline, grid and
 * glow backdrops, corner brackets, and the seekable GSAP steps behind decoded
 * text, typewriter lines, glitch bursts and split-text reveals.
 *
 * Pure and deterministic. Every "random" choice comes from a PRNG seeded by the
 * text it decorates, so the same input always writes the same HTML and a
 * HyperFrames render can seek to any frame. Nothing here loads a font or a file:
 * the style uses system fonts and CSS gradients only.
 */
import type { MotionPalette } from "./motion";
import { esc, num } from "./hyperframesproject";

export const HT_MONO = `Consolas, "DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace`;
export const HT_SANS = `"Segoe UI", Inter, "DejaVu Sans", Arial, sans-serif`;
/** Frames per second the stepped effects (decode, typewriter, glitch) tick at. */
export const HT_STEP = 1 / 30;

const GLYPHS = "01<>/\\[]{}#%$&*+=-_~|:;";

/** A small seeded PRNG (mulberry32): the same seed always yields the same sequence. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from text (FNV-1a). */
export function seedOf(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("\u0001")) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A string literal that is safe inside an inline <script>: JSON, with the
 * characters that could end the script or the line escaped.
 */
export const jsStr = (s: string) =>
  JSON.stringify(s).replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const parse = (hex: string): [number, number, number] => {
  const h = (/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000").slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};
const toHex = (c: number[]) =>
  "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** `a` toward `b` by `k` (0 to 1). */
export const mix = (a: string, b: string, k: number) => {
  const [x, y] = [parse(a), parse(b)];
  return toHex(x.map((v, i) => v + (y[i] - v) * k));
};

/** Relative luminance, 0 (black) to 1 (white). */
export const luminance = (hex: string) => {
  const [r, g, b] = parse(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const rgba = (hex: string, a: number) => `rgba(${parse(hex).join(",")},${a})`;

/** Lightens a color until it glows on a dark background. */
export const neon = (hex: string) => {
  let out = /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : "#00E5FF";
  for (let i = 0; i < 8 && luminance(out) < 0.35; i++) out = mix(out, "#FFFFFF", 0.2);
  return out;
};

export type HtTheme = {
  /** The page color: always dark, so light text on it is always legible. */
  base: string;
  /** Glass panels and chips behind text. */
  deep: string;
  /** Neon colors taken from the palette: primary, accent, highlight. */
  a1: string;
  a2: string;
  a3: string;
  text: string;
  dim: string;
};

export function hightechTheme(p: MotionPalette): HtTheme {
  let base = /^#[0-9a-f]{6}$/i.test(p.dark) ? p.dark.toUpperCase() : "#08142B";
  base = mix(base, "#000000", 0.3);
  for (let i = 0; i < 6 && luminance(base) > 0.03; i++) base = mix(base, "#000000", 0.3);
  return {
    base,
    deep: mix(base, "#000000", 0.45),
    a1: neon(p.primary),
    a2: neon(p.accent),
    a3: neon(p.pop),
    text: "#EAF8FF",
    dim: "#B7D3E3",
  };
}

// ---------------------------------------------------------------------------
// Static look
// ---------------------------------------------------------------------------

/** Class names the compositions share; `S` is the frame width over 1280. */
export function hightechCss(t: HtTheme, S: number): string {
  const px = (n: number) => `${num(n * S)}px`;
  const corner = (w: number) => `border: 0 solid ${t.a1}; width: ${px(w)}; height: ${px(w)};`;
  return `
.ht-grid { position: absolute; inset: 0; background-image: linear-gradient(${rgba(t.a1, 0.1)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(t.a1, 0.1)} 1px, transparent 1px); background-size: ${px(48)} ${px(48)}; }
.ht-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 18% 12%, ${rgba(t.a1, 0.22)}, transparent 55%), radial-gradient(ellipse at 88% 92%, ${rgba(t.a3, 0.16)}, transparent 55%); }
.ht-scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,.2) 0, rgba(0,0,0,.2) 1px, transparent 1px, transparent ${px(3)}); }
.ht-vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, transparent 52%, rgba(0,0,0,.6)); }
.ht-br { position: absolute; transform-origin: 0 0; }
.ht-tl { left: 0; top: 0; ${corner(26)} border-left-width: ${px(3)}; border-top-width: ${px(3)}; transform-origin: 0 0; }
.ht-tr { right: 0; top: 0; ${corner(26)} border-right-width: ${px(3)}; border-top-width: ${px(3)}; transform-origin: 100% 0; }
.ht-bl { left: 0; bottom: 0; ${corner(26)} border-left-width: ${px(3)}; border-bottom-width: ${px(3)}; transform-origin: 0 100%; }
.ht-bd { right: 0; bottom: 0; ${corner(26)} border-right-width: ${px(3)}; border-bottom-width: ${px(3)}; transform-origin: 100% 100%; }
.ht-br { filter: drop-shadow(0 0 ${px(5)} ${t.a1}); }
.ht-tag { position: absolute; font: 700 ${px(13)}/1 ${HT_MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${t.a1}; white-space: nowrap; text-shadow: 0 0 ${px(8)} ${rgba(t.a1, 0.8)}; }
.ht-bar { position: absolute; left: 0; width: 100%; opacity: 0; mix-blend-mode: screen; }
.ht-beam { position: absolute; left: 0; width: 100%; opacity: 0; background: linear-gradient(180deg, transparent, ${rgba(t.a1, 0.14)} 50%, transparent); }
`;
}

const CORNERS = ["tl", "tr", "bl", "bd"] as const;

/** Four corner brackets; give the container a size and position. */
export function bracketsHtml(id: string, extra = ""): string {
  return CORNERS.map((c, k) => `<i id="${id}k${k}" class="ht-br ht-${c}" style="opacity:0;${extra}"></i>`).join("");
}

/** Draws the brackets in, corner by corner (or sets them when there is no animation). */
export function bracketsJs(js: string[], id: string, at: number, animate: boolean): void {
  CORNERS.forEach((_, k) => {
    const sel = `"#${id}k${k}"`;
    js.push(
      animate
        ? `tl.fromTo(${sel},{opacity:0,scale:0.2},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.7)"},${num(at + k * 0.06)});`
        : `tl.set(${sel},{opacity:1},${num(at)});`,
    );
  });
}

/** A slow pulse on the brackets, over `[from, to]`, as a few finite tweens. */
export function bracketsPulseJs(js: string[], id: string, from: number, to: number): void {
  const cycle = 2.4;
  const n = Math.max(0, Math.floor((to - from) / cycle));
  CORNERS.forEach((_, k) => {
    for (let i = 0; i < n; i++) {
      const t = num(from + i * cycle);
      js.push(
        `tl.to("#${id}k${k}",{opacity:0.45,duration:${cycle / 2},ease:"sine.inOut"},${t});`,
        `tl.to("#${id}k${k}",{opacity:1,duration:${cycle / 2},ease:"sine.inOut"},${num(from + i * cycle + cycle / 2)});`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Seekable text effects. Each returns JavaScript lines for the GSAP timeline `tl`.
// ---------------------------------------------------------------------------

/**
 * Decodes `text` into the element, left to right, out of random symbols: one
 * step per frame. The element must be set in a monospace font so the width holds.
 */
export function decodeJs(id: string, text: string, at: number, duration: number, seed: number): string[] {
  const chars = [...text];
  const rnd = prng(seed);
  const steps = Math.max(2, Math.round(duration / HT_STEP));
  const out: string[] = [];
  for (let k = 0; k < steps; k++) {
    const done = Math.floor((chars.length * (k + 1)) / steps);
    const shown = chars.map((ch, i) => (i < done || ch === " " ? ch : GLYPHS[Math.floor(rnd() * GLYPHS.length)])).join("");
    out.push(`tl.set("#${id}",{textContent:${jsStr(shown)}},${num(at + (k * duration) / steps)});`);
  }
  return out;
}

/**
 * A typewriter line with a block cursor. `on` holds the typed part and `off` the
 * rest, so the line keeps its full width while it types.
 */
export function typeJs(
  ids: { on: string; off: string; cursor: string },
  text: string,
  at: number,
  charsPerSecond: number,
  hold: number,
): string[] {
  const chars = [...text];
  const out: string[] = [`tl.set("#${ids.cursor}",{opacity:1},${num(at)});`];
  chars.forEach((_, k) => {
    const t = num(at + k / charsPerSecond);
    out.push(
      `tl.set("#${ids.on}",{textContent:${jsStr(chars.slice(0, k + 1).join(""))}},${t});`,
      `tl.set("#${ids.off}",{textContent:${jsStr(chars.slice(k + 1).join(""))}},${t});`,
    );
  });
  const done = at + chars.length / charsPerSecond;
  // The cursor blinks twice a second after the last character, then goes.
  for (let b = 0; b < Math.floor(hold * 2); b++) {
    out.push(`tl.set("#${ids.cursor}",{opacity:${b % 2 === 0 ? 0 : 1}},${num(done + b * 0.5)});`);
  }
  out.push(`tl.set("#${ids.cursor}",{opacity:0},${num(done + hold)});`);
  return out;
}

/** The markup for a typewriter line: typed text, cursor, then the untyped rest. */
export function typeHtml(id: string, text: string, cursorColor: string): string {
  return (
    `<span id="${id}o"></span><i id="${id}u" style="display:inline-block;width:.55em;height:1em;vertical-align:-.12em;margin-left:.08em;background:${cursorColor};opacity:0"></i>` +
    `<span id="${id}f" style="opacity:0">${esc(text)}</span>`
  );
}

/**
 * A short burst of horizontal jitter, flicker and red/cyan channel split on
 * `sel`, settling at `at + duration`. Steps run every other frame.
 */
export function glitchJs(sel: string, at: number, duration: number, seed: number, width: number, S: number): string[] {
  const rnd = prng(seed);
  const n = Math.max(3, Math.round(duration / (HT_STEP * 2)));
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const fade = 1 - k / n;
    const dx = Math.round((rnd() - 0.5) * 2 * width * 0.028 * fade);
    const split = Math.max(1, Math.round(7 * S * fade));
    const slice = rnd() < 0.45 ? `inset(${Math.round(rnd() * 60)}% 0 ${Math.round(rnd() * 30)}% 0)` : "none";
    out.push(
      `tl.set(${sel},{x:${dx},opacity:${k % 3 === 1 ? 0.55 : 1},clipPath:${jsStr(slice)},` +
        `filter:${jsStr(`drop-shadow(${split}px 0 0 rgba(255,32,96,.85)) drop-shadow(${-split}px 0 0 rgba(0,235,255,.85))`)}},${num(at + (k * duration) / n)});`,
    );
  }
  out.push(`tl.set(${sel},{x:0,opacity:1,clipPath:"none",filter:"none"},${num(at + duration)});`);
  return out;
}

/** Thin neon bars that flash across the frame during a glitch. */
export function glitchBarsHtml(id: string, count: number, H: number, S: number): string {
  return Array.from(
    { length: count },
    (_, k) => `<i id="${id}g${k}" class="ht-bar" style="top:${num(H * (0.2 + 0.3 * k))}px;height:${num(Math.max(2, 5 * S))}px"></i>`,
  ).join("");
}

export function glitchBarsJs(
  js: string[],
  id: string,
  count: number,
  at: number,
  duration: number,
  seed: number,
  H: number,
  colors: string[],
): void {
  const rnd = prng(seed ^ 0x9e3779b9);
  const steps = Math.max(3, Math.round(duration / (HT_STEP * 3)));
  for (let k = 0; k < count; k++) {
    const sel = `"#${id}g${k}"`;
    js.push(`tl.set(${sel},{backgroundColor:${jsStr(colors[k % colors.length])}},${num(at)});`);
    for (let s = 0; s < steps; s++) {
      js.push(
        `tl.set(${sel},{y:${Math.round((rnd() - 0.5) * H * 0.5)},opacity:${num(0.35 + rnd() * 0.55)}},${num(at + (s * duration) / steps)});`,
      );
    }
    js.push(`tl.set(${sel},{opacity:0},${num(at + duration)});`);
  }
}

// ---------------------------------------------------------------------------
// Split text: every character in its own span, so a headline can reveal and decode letter by letter.
// ---------------------------------------------------------------------------

/**
 * A short line whose letters start spread apart and close up into place: a
 * letter-spacing sweep made of transforms, which stay smooth when seeking.
 * Set it in a monospace font so the spread is even.
 */
export function spreadHtml(id: string, text: string): string {
  return [...text]
    .map((ch, k) => `<span id="${id}c${k}" style="display:inline-block;white-space:pre;opacity:0">${esc(ch)}</span>`)
    .join("");
}

export function spreadJs(js: string[], id: string, text: string, at: number, duration: number, gap: number): void {
  const n = [...text].length;
  for (let k = 0; k < n; k++) {
    js.push(
      `tl.fromTo("#${id}c${k}",{x:${num((k - (n - 1) / 2) * gap)},opacity:0},{x:0,opacity:1,duration:${duration},ease:"power3.out"},${num(at + k * 0.012)});`,
    );
  }
}

export type SplitText = {
  html: string;
  words: { id: string; chars: { id: string; ch: string }[] }[];
};

export function splitText(id: string, text: string): SplitText {
  const words = text.split(/\s+/).filter(Boolean).map((word, k) => ({
    id: `${id}w${k}`,
    chars: [...word].map((ch, c) => ({ id: `${id}w${k}c${c}`, ch })),
  }));
  const html = words
    .map((w) => `<span id="${w.id}" class="w">${w.chars.map((c) => `<span id="${c.id}" class="ch" style="opacity:0">${esc(c.ch)}</span>`).join("")}</span>`)
    .join(" ");
  return { html, words };
}

/** Letters rise in one after another, each flickering through a few symbols first. */
export function revealJs(js: string[], split: SplitText, startOf: (word: number) => number, S: number, seed: number): void {
  const rnd = prng(seed);
  split.words.forEach((w, k) => {
    w.chars.forEach((c, i) => {
      const t = startOf(k) + i * 0.025;
      const sel = `"#${c.id}"`;
      js.push(
        `tl.fromTo(${sel},{opacity:0},{opacity:1,duration:0.18,ease:"none"},${num(t)});`,
        `tl.fromTo(${sel},{y:${num(18 * S)}},{y:0,duration:0.3,ease:"power3.out"},${num(t)});`,
      );
      for (let s = 0; s < 2; s++) {
        js.push(`tl.set(${sel},{textContent:${jsStr(GLYPHS[Math.floor(rnd() * GLYPHS.length)])}},${num(t + s * HT_STEP)});`);
      }
      js.push(`tl.set(${sel},{textContent:${jsStr(c.ch)}},${num(t + 2 * HT_STEP)});`);
    });
  });
}
