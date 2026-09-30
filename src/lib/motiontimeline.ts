/**
 * Turns a motion plan and its measured narration into the exact render config
 * scripts/motion/render.py plays back: when every scene starts, where every
 * layer sits, and when each word, chip and character arrives.
 *
 * The renderer does no planning of its own. Keeping the timing and layout
 * here, in a pure function, is what lets it be tested.
 */
import type { Entrance, Idle, MotionPalette, MotionPlan, Placement, Transition } from "./motion";

export const LEAD_IN = 0.7;
export const TAIL = 0.8;
export const MIN_SCENE = 4;
export const TRANSITION_S = 0.5;
export const FADE_OUT = 0.8;
/** Used when a clip is missing: an even conversational pace. */
const WORDS_PER_SECOND = 2.6;

export type Ease = "linear" | "outCubic" | "outBack" | "inOutSine";

/** Offsets from the layer's anchor, plus scale and opacity, at a scene time. */
export type Keyframe = {
  t: number;
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  /** Easing used to arrive at this keyframe from the previous one. */
  ease: Ease;
};

export type ActorLayer = {
  type: "actor";
  src: string;
  /** Bottom-center anchor and the box the picture is fitted into. */
  cx: number;
  baseline: number;
  maxW: number;
  maxH: number;
  flip: boolean;
  /** Light disc behind the actor, used on the closing card so it stands out. */
  backdrop: string | null;
  keyframes: Keyframe[];
  idle: { kind: Exclude<Idle, "none">; amp: number; period: number; phase: number } | null;
};

export type HeadlineLayer = {
  type: "headline";
  words: { text: string; at: number }[];
  y: number;
  size: number;
  color: string;
  /** Rounded panel behind the headline; null sets it straight on the frame. */
  panel: string | null;
};

export type SublineLayer = {
  type: "subline";
  text: string;
  at: number;
  y: number;
  size: number;
  color: string;
};

export type ChipsLayer = {
  type: "chips";
  items: { text: string; at: number; fill: string }[];
  y: number;
  size: number;
  textColor: string;
};

export type StatLayer = {
  type: "stat";
  value: string;
  label: string;
  at: number;
  cx: number;
  cy: number;
  size: number;
  color: string;
  card: string;
  labelColor: string;
};

export type Layer = ActorLayer | HeadlineLayer | SublineLayer | ChipsLayer | StatLayer;

export type RenderScene = {
  start: number;
  duration: number;
  transition: { kind: Transition; duration: number };
  background: { src: string | null; color: string; zoomFrom: number; zoomTo: number };
  layers: Layer[];
};

export type RenderConfig = {
  output: string;
  width: number;
  height: number;
  fps: number;
  palette: MotionPalette;
  duration: number;
  fadeOut: number;
  scenes: RenderScene[];
  /** Absolute start of each clip on the soundtrack. */
  narration: { src: string; at: number }[];
  music: { src: string; volume: number } | null;
};

export type SceneAssets = {
  background: string | null;
  /** One entry per actor in the plan scene; null where the picture failed. */
  actors: (string | null)[];
  narration: string | null;
  /** Measured length of the narration clip in seconds. */
  narrationSeconds: number | null;
};

export type TimelineOptions = {
  output: string;
  width?: number;
  height?: number;
  fps?: number;
  music?: string | null;
  /** Music gain before ducking. */
  musicVolume?: number;
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SECOND;
}

function slotX(p: Placement, W: number): number {
  return p === "left" ? W * 0.22 : p === "right" ? W * 0.78 : W * 0.5;
}

function entranceKeyframes(e: Entrance, at: number, W: number, H: number): Keyframe[] {
  const k = (t: number, o: Partial<Keyframe>, ease: Ease = "linear"): Keyframe => ({
    t: round(t),
    dx: 0,
    dy: 0,
    scale: 1,
    opacity: 1,
    ease,
    ...o,
  });
  switch (e) {
    case "slide-left":
      return [k(0, { dx: -W * 0.6 }), k(at, { dx: -W * 0.6 }), k(at + 0.7, {}, "outCubic")];
    case "slide-right":
      return [k(0, { dx: W * 0.6 }), k(at, { dx: W * 0.6 }), k(at + 0.7, {}, "outCubic")];
    case "rise":
      return [
        k(0, { dy: H * 0.17, opacity: 0 }),
        k(at, { dy: H * 0.17, opacity: 0 }),
        k(at + 0.6, {}, "outCubic"),
      ];
    case "fade":
      return [k(0, { opacity: 0 }), k(at, { opacity: 0 }), k(at + 0.6, {}, "inOutSine")];
    case "pop":
    default:
      return [
        k(0, { scale: 0, opacity: 0 }),
        k(at, { scale: 0, opacity: 0 }),
        k(at + 0.55, {}, "outBack"),
      ];
  }
}

/** A free slot for the stat card, away from the actors. */
function statSlot(used: Set<Placement>): Placement {
  if (!used.has("center") && used.size !== 1) return "center";
  if (used.has("left") && !used.has("right")) return "right";
  if (used.has("right") && !used.has("left")) return "left";
  if (!used.has("center")) return "center";
  return used.has("left") ? "right" : "left";
}

/**
 * Compile the plan into a render config. `assets` lines up with
 * `plan.scenes`; any missing picture is dropped rather than failing the video.
 */
export function compileTimeline(
  plan: MotionPlan,
  assets: SceneAssets[],
  opts: TimelineOptions
): RenderConfig {
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  const s = W / 1280;
  const palette = plan.style.palette;

  let clock = 0;
  const narration: RenderConfig["narration"] = [];

  const scenes: RenderScene[] = plan.scenes.map((scene, i) => {
    const a = assets[i] ?? { background: null, actors: [], narration: null, narrationSeconds: null };
    const spoken = a.narrationSeconds ?? estimateSpeechSeconds(scene.narration);
    const duration = round(Math.max(MIN_SCENE, LEAD_IN + spoken + TAIL));
    const start = round(clock);
    clock += duration;
    if (a.narration) narration.push({ src: a.narration, at: round(start + LEAD_IN) });

    const endCard = scene.beat === "cta";
    const layers: Layer[] = [];

    // Headline: words rise in one after another, starting as the transition ends.
    const words = scene.headline.split(/\s+/).filter(Boolean);
    const headlineAt = 0.35;
    layers.push({
      type: "headline",
      words: words.map((text, w) => ({ text, at: round(headlineAt + w * 0.12) })),
      y: Math.round((endCard ? H * 0.26 : 34 * s)),
      size: Math.round((endCard ? 68 : 52) * s),
      color: endCard ? palette.light : palette.dark,
      panel: endCard ? null : palette.light,
    });
    const headlineDone = headlineAt + words.length * 0.12 + 0.3;

    if (scene.subline) {
      layers.push({
        type: "subline",
        text: scene.subline,
        at: round(headlineDone),
        y: Math.round(endCard ? H * 0.26 + 100 * s : 118 * s),
        size: Math.round((endCard ? 30 : 24) * s),
        color: endCard ? palette.light : palette.dark,
      });
    }

    // Actors: staggered, after the headline has started.
    const used = new Set<Placement>();
    scene.actors.forEach((actor, n) => {
      const src = a.actors[n];
      if (!src) return;
      used.add(actor.placement);
      const hero = actor.kind === "hero";
      const at = 0.5 + n * 0.3;
      const kf = entranceKeyframes(actor.entrance, at, W, H);
      layers.push({
        type: "actor",
        src,
        cx: Math.round(endCard ? (n === 0 ? W * 0.16 : W * 0.84) : slotX(actor.placement, W)),
        baseline: Math.round(H * (endCard ? 0.92 : 0.96)),
        maxW: Math.round(W * 0.3),
        maxH: Math.round(H * (hero ? (endCard ? 0.4 : 0.54) : endCard ? 0.28 : 0.36)),
        // The hero is drawn facing right; on the right it turns to face in.
        flip: hero && (endCard ? n === 1 : actor.placement === "right"),
        backdrop: endCard ? palette.light : null,
        keyframes: kf,
        idle:
          actor.idle === "none"
            ? null
            : {
                kind: actor.idle,
                amp: Math.round((actor.idle === "float" ? 8 : 5) * s),
                period: actor.idle === "float" ? 3.2 : 1.6,
                phase: round(n * 0.9),
              },
      });
    });

    // Chips and the stat land while the narrator is talking about them.
    if (scene.callouts.length) {
      const n = scene.callouts.length;
      const fills = endCard
        ? [palette.accent, palette.pop, palette.primary]
        : [palette.primary, palette.accent, palette.pop];
      layers.push({
        type: "chips",
        items: scene.callouts.map((text, c) => ({
          text,
          at: round(LEAD_IN + spoken * (n === 1 ? 0.3 : 0.2 + (0.5 * c) / (n - 1))),
          fill: fills[c % fills.length],
        })),
        y: Math.round(endCard ? H * 0.26 + 160 * s : 166 * s),
        size: Math.round(22 * s),
        textColor: "#FFFFFF",
      });
    }

    if (scene.stat) {
      const slot = endCard ? "center" : statSlot(used);
      layers.push({
        type: "stat",
        value: scene.stat.value,
        label: scene.stat.label,
        at: round(LEAD_IN + spoken * 0.2),
        cx: Math.round(slotX(slot, W)),
        cy: Math.round(H * 0.64),
        size: Math.round(84 * s),
        color: palette.accent,
        card: palette.light,
        labelColor: palette.dark,
      });
    }

    return {
      start,
      duration,
      transition: { kind: i === 0 ? "fade" : scene.transition, duration: TRANSITION_S },
      background: {
        src: endCard ? null : a.background,
        color: endCard ? palette.dark : palette.light,
        zoomFrom: 1,
        zoomTo: endCard ? 1 : 1.06,
      },
      layers,
    };
  });

  return {
    output: opts.output,
    width: W,
    height: H,
    fps: opts.fps ?? 24,
    palette,
    duration: round(clock),
    fadeOut: FADE_OUT,
    scenes,
    narration,
    music: opts.music ? { src: opts.music, volume: opts.musicVolume ?? 0.35 } : null,
  };
}

const MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

/**
 * Length of an MP3 in seconds, by walking its Layer III frames. Speech comes
 * back as MP3 and the timeline needs each clip's length before anything is
 * rendered; this avoids a round trip to ffprobe for every scene.
 */
export function mp3Duration(buf: Uint8Array): number {
  let i = 0;
  // Skip an ID3v2 tag: "ID3", version, flags, then a 28-bit syncsafe size.
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  }
  let seconds = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++;
      continue;
    }
    const version = (buf[i + 1] >> 3) & 3;
    const layer = (buf[i + 1] >> 1) & 3;
    const bitrateIdx = (buf[i + 2] >> 4) & 0xf;
    const rateIdx = (buf[i + 2] >> 2) & 3;
    const padding = (buf[i + 2] >> 1) & 1;
    const rates = RATES[version];
    // Layer III only (layer bits 01); version 1 is reserved.
    if (layer !== 1 || !rates || rateIdx === 3 || bitrateIdx === 0 || bitrateIdx === 15) {
      i++;
      continue;
    }
    const kbps = (version === 3 ? MPEG1_L3 : MPEG2_L3)[bitrateIdx];
    const rate = rates[rateIdx];
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + padding;
    seconds += samples / rate;
    i += Math.max(length, 1);
  }
  // Speech output is a fixed 96 kbit/s, so size is a fair estimate if parsing fails.
  return seconds > 0 ? seconds : (buf.length * 8) / 96_000;
}
