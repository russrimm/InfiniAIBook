/**
 * Motion explainers: a 2D flat-vector animated explainer planned from the
 * notebook, built from generated layers (background plates, a recurring hero
 * character and props) and animated by scripts/motion/render.py.
 *
 * The image model draws pictures only. Every word on screen is set by the
 * renderer in a real font, because image models misspell lettering.
 *
 * Nothing here touches the server, so the planner rules and the normalizer can
 * be unit-tested.
 */

export const BEATS = ["problem", "solution", "how", "benefits", "cta"] as const;
export const PLACEMENTS = ["left", "center", "right"] as const;
export const ENTRANCES = ["slide-left", "slide-right", "pop", "rise", "fade"] as const;
export const IDLES = ["float", "bob", "none"] as const;
export const TRANSITIONS = ["wipe", "slide", "fade"] as const;

export type Beat = (typeof BEATS)[number];
export type Placement = (typeof PLACEMENTS)[number];
export type Entrance = (typeof ENTRANCES)[number];
export type Idle = (typeof IDLES)[number];
export type Transition = (typeof TRANSITIONS)[number];

export type MotionActor = {
  /** The hero is drawn once and reused; a prop is drawn for its scene. */
  kind: "hero" | "prop";
  /** What a prop is. Ignored for the hero, whose look is fixed by the style. */
  description: string;
  placement: Placement;
  entrance: Entrance;
  idle: Idle;
};

export type MotionScene = {
  beat: Beat;
  /** Kinetic headline, revealed word by word. */
  headline: string;
  /** One short line under the headline. */
  subline: string;
  /** Up to three short chips that pop in while the narrator speaks. */
  callouts: string[];
  /** One headline number, when the sources give one. */
  stat?: { value: string; label: string };
  /** The environment behind the actors. Unused for the closing card. */
  background: string;
  actors: MotionActor[];
  narration: string;
  /** How this scene arrives. */
  transition: Transition;
};

export type MotionPalette = {
  /** Deep color for text and the opening and closing frames. */
  dark: string;
  primary: string;
  accent: string;
  /** Second accent for chips and highlights. */
  pop: string;
  light: string;
};

export type MotionStyle = { palette: MotionPalette; hero: string };

export type MotionPlan = {
  title: string;
  description: string;
  style: MotionStyle;
  scenes: MotionScene[];
};

/** Scenes asked of the planner: problem, solution, three how, benefits, CTA. */
export const MOTION_SCENE_COUNT = 7;
export const MAX_SCENES = 9;
export const MAX_ACTORS_PER_SCENE = 2;
/** Props across the whole video. Each is an image call, and they add up. */
export const MAX_PROPS = 8;

export const DEFAULT_PALETTE: MotionPalette = {
  dark: "#12324A",
  primary: "#1B9AAA",
  accent: "#F29E4C",
  pop: "#EF5B5B",
  light: "#F4F7F5",
};

export const DEFAULT_HERO =
  "a friendly cartoon office worker in their thirties with short dark hair, " +
  "a teal sweater over a white collar, navy trousers and brown shoes";

export const MOTION_PLAN_INSTRUCTION = (topic: string) => `You are a scriptwriter and art director for 2D motion-graphics explainer videos:
flat vector characters and objects slide and pop into simple scenes, bold
headlines animate on, and a warm narrator tells a short story.

Plan a ${MOTION_SCENE_COUNT}-scene video from the sources${topic ? `, focused on: ${topic}` : ""}.
Respond with a single JSON object only. No markdown fences, no commentary.

Schema:
{
  "title": string,          // <= 60 chars, names the subject concretely
  "description": string,    // one sentence on what a viewer will learn
  "style": {
    "palette": { "dark": "#RRGGBB", "primary": "#RRGGBB", "accent": "#RRGGBB",
                 "pop": "#RRGGBB", "light": "#RRGGBB" },
    "hero": string          // the recurring character's look, 15-35 words
  },
  "scenes": [{
    "beat": "problem" | "solution" | "how" | "benefits" | "cta",
    "headline": string,     // 2-5 words, animated word by word
    "subline": string,      // <= 60 chars, one plain sentence
    "callouts": string[],   // 0-3 items, each <= 24 chars
    "stat": { "value": string, "label": string },   // optional, see below
    "background": string,   // the setting, as a picture: 10-25 words
    "actors": [{
      "kind": "hero" | "prop",
      "description": string,  // props only: one object, 4-15 words
      "placement": "left" | "center" | "right",
      "entrance": "slide-left" | "slide-right" | "pop" | "rise" | "fade",
      "idle": "float" | "bob" | "none"
    }],
    "narration": string,    // 2-3 sentences, 10-16 seconds spoken
    "transition": "wipe" | "slide" | "fade"
  }]
}

STORY ARC, in this order
1. problem — the pain or question the sources address, made concrete.
2. solution — what the sources propose, introduced by name if they give one.
3-5. how — one mechanism or step each, in order.
6. benefits — the payoff, with a number from the sources if there is one.
7. cta — the one next step a viewer should take, as the sources describe it.

THE LOOK
Pick a palette that suits the subject: one dark color for text, a primary and
two accents, and a very light background color. Hex values only.
The hero is one recurring cartoon person who appears in most scenes. Describe
their clothes and colors concretely so every drawing matches. Never a real
person, never a celebrity, never a mascot from a real company.

ACTORS
At most two per scene, in different placements. Use the hero in four or more
scenes. A prop is ONE object a designer could draw in a minute: "an
overflowing trash bin", "a smartphone showing a bar chart", "a delivery truck".
Describe objects, not ideas. Never text, never a logo, never a brand.

BACKGROUND
A simple setting described as a picture, with no people in it: "a bright
modern kitchen counter with a window", "a city street at dusk". The closing
cta scene is set on a plain card, so its background may be an empty string.

ON-SCREEN TEXT
Headlines are short and punchy: "FOOD GOES TO WASTE", "MEET THE FIX". The
subline is a plain sentence, not the headline repeated. Callouts are 1-4 word
chips. A stat is only for a number that appears in the sources: value <= 10
characters ("40%", "3x", "1.3B tons"), label <= 32 characters. Omit "stat"
otherwise. Never invent a number, a URL, a price, a phone number or an offer.

NARRATION
Warm and conversational, plain language, contractions throughout. Two or three
sentences per scene. Close the cta scene on the next step, not a sign-off. No
markdown, no citation markers, no stage directions: every character is read
aloud.

Ground every claim in the excerpts. If the sources do not support a beat, cover
what they do support rather than inventing it.`;

type Loose = Record<string, unknown>;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

/** Every character of narration reaches a voice, so markup would be read out. */
export const cleanText = (s: string) =>
  s
    .replace(/\[\d+\](?:\[\d+\])*/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

/** Trim to a limit at a word boundary rather than mid-word. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.5 ? cut.slice(0, space) : s.slice(0, max)).replace(/[\s,;:–—-]+$/, "");
}

function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T): T {
  const s = str(v).toLowerCase().trim();
  return (list as readonly string[]).includes(s) ? (s as T) : fallback;
}

const HEX = /^#[0-9a-f]{6}$/i;

function normalizePalette(raw: unknown): MotionPalette {
  const p = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const pick = (k: keyof MotionPalette) => {
    const v = str(p[k]).trim();
    return HEX.test(v) ? v.toUpperCase() : DEFAULT_PALETTE[k];
  };
  return {
    dark: pick("dark"),
    primary: pick("primary"),
    accent: pick("accent"),
    pop: pick("pop"),
    light: pick("light"),
  };
}

/** The layout has three slots; two actors in one slot would overlap. */
function spreadPlacements(actors: MotionActor[]): MotionActor[] {
  const used = new Set<Placement>();
  return actors.map((a) => {
    if (!used.has(a.placement)) {
      used.add(a.placement);
      return a;
    }
    const free = (["left", "right", "center"] as const).find((p) => !used.has(p))!;
    used.add(free);
    return { ...a, placement: free };
  });
}

function normalizeActors(raw: unknown): MotionActor[] {
  const list = Array.isArray(raw) ? raw : [];
  const actors: MotionActor[] = [];
  let hero = false;
  for (const item of list) {
    if (actors.length >= MAX_ACTORS_PER_SCENE) break;
    const o = (item && typeof item === "object" ? item : {}) as Loose;
    const kind = str(o.kind).toLowerCase() === "hero" ? "hero" : "prop";
    const description = clip(cleanText(str(o.description)), 140);
    if (kind === "prop" && !description) continue;
    // One hero per scene: it is a single character.
    if (kind === "hero" && hero) continue;
    if (kind === "hero") hero = true;
    actors.push({
      kind,
      description: kind === "hero" ? "" : description,
      placement: oneOf(PLACEMENTS, o.placement, actors.length ? "right" : "left"),
      entrance: oneOf(ENTRANCES, o.entrance, "pop"),
      idle: oneOf(IDLES, o.idle, "float"),
    });
  }
  return spreadPlacements(actors);
}

function normalizeStat(raw: unknown): MotionScene["stat"] {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Loose;
  const value = cleanText(str(o.value)).slice(0, 10).trim();
  const label = clip(cleanText(str(o.label)), 32);
  // A stat with no digit in it is a slogan, not a number.
  if (!value || !label || !/\d/.test(value)) return undefined;
  return { value, label };
}

/**
 * Coerce whatever the model returned into a plan the build can rely on:
 * lengths clamped, enums whitelisted, actors capped per scene and props capped
 * across the video. Returns null when too little survives to make a video.
 */
export function normalizeMotionPlan(raw: Loose): MotionPlan | null {
  const style = (raw.style && typeof raw.style === "object" ? raw.style : {}) as Loose;
  const hero = clip(cleanText(str(style.hero)), 220) || DEFAULT_HERO;

  let props = 0;
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : [])
    .map((s): MotionScene | null => {
      const o = (s && typeof s === "object" ? s : {}) as Loose;
      const headline = clip(cleanText(str(o.headline)), 36);
      const narration = cleanText(str(o.narration));
      if (!headline || !narration) return null;
      const callouts = (Array.isArray(o.callouts) ? o.callouts : [])
        .map((c) => clip(cleanText(str(c)), 24))
        .filter(Boolean)
        .slice(0, 3);
      return {
        beat: oneOf(BEATS, o.beat, "how"),
        headline,
        subline: clip(cleanText(str(o.subline)), 70),
        callouts,
        stat: normalizeStat(o.stat),
        background: clip(cleanText(str(o.background)), 200),
        actors: normalizeActors(o.actors),
        narration,
        transition: oneOf(TRANSITIONS, o.transition, "wipe"),
      };
    })
    .filter((s): s is MotionScene => s !== null)
    // More scenes than asked for multiplies cost and running time.
    .slice(0, MAX_SCENES)
    .map((scene) => ({
      ...scene,
      actors: scene.actors.filter((a) => {
        if (a.kind === "hero") return true;
        if (props >= MAX_PROPS) return false;
        props++;
        return true;
      }),
    }));

  if (scenes.length < 3) return null;
  return {
    title: clip(cleanText(str(raw.title, "Motion explainer")), 80) || "Motion explainer",
    description: cleanText(str(raw.description)),
    style: { palette: normalizePalette(style.palette), hero },
    scenes,
  };
}

const paletteWords = (p: MotionPalette) =>
  `${p.primary}, ${p.accent}, ${p.pop}, ${p.dark} and ${p.light}`;

/** Shared by every asset so the backgrounds, hero and props look like one film. */
export function styleBase(style: MotionStyle): string {
  return (
    "Flat 2D vector illustration in a modern explainer-animation style: clean " +
    "geometric shapes, rounded corners, flat color fills with at most a subtle " +
    "two-tone shadow, no gradients, no texture, no photorealism, no outlines " +
    `heavier than a thin dark line. Limited palette built from ${paletteWords(style.palette)}. ` +
    "No text, letters, numbers, labels, logos, watermarks or brand marks anywhere."
  );
}

export function backgroundPrompt(scene: MotionScene, style: MotionStyle): string {
  return (
    `${styleBase(style)} Wide landscape background plate for an animated scene: ` +
    `${scene.background || "a simple, softly lit abstract space"}. Environment only, ` +
    "with no people, no characters and no animals. Keep the lower half open and " +
    "uncluttered and the top quarter plain, so characters and titles can be placed " +
    "over it. Slightly muted, low-contrast colors so foreground elements stand out."
  );
}

export function heroPrompt(style: MotionStyle): string {
  return (
    `${styleBase(style)} One full-body cartoon character: ${style.hero}. Standing, ` +
    "turned three-quarters toward the viewer's right, friendly expression, one hand " +
    "raised a little as if explaining. The whole figure in frame with margin around " +
    "it, feet visible. Isolated on a plain transparent background: no floor, no " +
    "ground shadow, no scenery, no other objects."
  );
}

export function propPrompt(actor: MotionActor, style: MotionStyle): string {
  return (
    `${styleBase(style)} One object: ${actor.description}. Centered, the whole ` +
    "object in frame with margin around it. Isolated on a plain transparent " +
    "background: no floor, no ground shadow, no scenery, no other objects."
  );
}
