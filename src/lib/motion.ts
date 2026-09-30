/**
 * Motion explainers: a 2D animated explainer planned from the notebook, built
 * from generated layers (background plates, an optional recurring character
 * and props) and animated by scripts/motion/render.py. Length, tone, audience,
 * look, colors, character, closing message and resolution can be customized
 * (MotionOptions); the defaults give a flat-vector video at 720p.
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

export type MotionStyle = {
  palette: MotionPalette;
  /** The recurring character's look; empty when the video has no character. */
  hero: string;
  /** How every picture is drawn. */
  visual: MotionVisual;
};

export type MotionPlan = {
  title: string;
  description: string;
  style: MotionStyle;
  scenes: MotionScene[];
};

/** Scenes asked of the planner by default: problem, solution, three how, benefits, CTA. */
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

// ---------------------------------------------------------------------------
// Customization. Every option is optional; the defaults reproduce the
// original seven-scene, friendly, flat-vector explainer at 720p.
// ---------------------------------------------------------------------------

export const MOTION_LENGTHS = {
  short: { label: "Short (about 1 min)", scenes: 5, how: 1 },
  standard: { label: "Standard (about 1.5–2 min)", scenes: 7, how: 3 },
  long: { label: "Long (about 2.5 min)", scenes: 9, how: 5 },
} as const;
export type MotionLength = keyof typeof MOTION_LENGTHS;

export const MOTION_TONES = {
  friendly: {
    label: "Friendly",
    rule: "Warm and conversational, plain language, contractions throughout.",
  },
  professional: {
    label: "Professional",
    rule: "Clear, confident and polished, like a well-run briefing: plain language, a measured pace, few contractions.",
  },
  energetic: {
    label: "Energetic",
    rule: "Upbeat and punchy, like a product launch: short sentences, active verbs, momentum from scene to scene.",
  },
  calm: {
    label: "Calm",
    rule: "Calm and reassuring, unhurried and gentle, like a patient guide.",
  },
  playful: {
    label: "Playful",
    rule: "Light and playful, with gentle humor where the sources allow it, never at the expense of accuracy.",
  },
} as const;
export type MotionTone = keyof typeof MOTION_TONES;

export const MOTION_AUDIENCES = {
  general: { label: "General", rule: "a general audience with no prior knowledge of the subject" },
  beginners: {
    label: "Beginners",
    rule: "complete beginners: define each term the first time it appears and use one everyday analogy",
  },
  executives: {
    label: "Executives",
    rule: "busy decision makers: lead with outcomes, costs and risks, and skip implementation detail",
  },
  technical: {
    label: "Technical",
    rule: "a technical audience: name the actual mechanisms, components and trade-offs precisely",
  },
} as const;
export type MotionAudience = keyof typeof MOTION_AUDIENCES;

/** How the image model draws every background, character and prop. */
export const MOTION_VISUALS = {
  flat: {
    label: "Flat vector",
    look:
      "Flat 2D vector illustration in a modern explainer-animation style: clean " +
      "geometric shapes, rounded corners, flat color fills with at most a subtle " +
      "two-tone shadow, no gradients, no texture, no photorealism, no outlines " +
      "heavier than a thin dark line.",
  },
  isometric: {
    label: "Isometric",
    look:
      "Isometric 2D vector illustration in a modern tech-explainer style: everything " +
      "drawn at one consistent 30-degree isometric angle, clean geometric shapes, flat " +
      "color fills with simple two-tone shading, no texture, no photorealism.",
  },
  papercut: {
    label: "Paper cutout",
    look:
      "Layered paper-cutout illustration: shapes cut from matte colored paper and " +
      "stacked in layers, with short soft drop shadows between them and a faint paper " +
      "grain, no photorealism.",
  },
  sketch: {
    label: "Hand-drawn",
    look:
      "Hand-drawn editorial illustration: confident dark ink outlines with a slight " +
      "wobble, loose flat color washes inside the lines, a friendly doodle feel, no " +
      "photorealism.",
  },
  clay: {
    label: "Soft 3D clay",
    look:
      "Soft 3D clay-style illustration: rounded, chunky, matte shapes like modeling " +
      "clay, gentle studio lighting with soft shadows, playful proportions, not " +
      "photorealistic.",
  },
  lineart: {
    label: "Minimal line art",
    look:
      "Minimal line-art illustration: clean, even-weight dark outlines, mostly unfilled " +
      "shapes with a few flat accent fills, plenty of empty space, no shading, no " +
      "photorealism.",
  },
} as const;
export type MotionVisual = keyof typeof MOTION_VISUALS;

export const MOTION_PALETTES = {
  ocean: { label: "Ocean", colors: DEFAULT_PALETTE },
  sunset: {
    label: "Sunset",
    colors: { dark: "#2D1E2F", primary: "#E4572E", accent: "#F3A712", pop: "#A8201A", light: "#FDF6EC" },
  },
  forest: {
    label: "Forest",
    colors: { dark: "#1F3A2E", primary: "#2E8B57", accent: "#C9A227", pop: "#E07A5F", light: "#F3F7F0" },
  },
  berry: {
    label: "Berry",
    colors: { dark: "#2B1B3D", primary: "#7B2CBF", accent: "#F72585", pop: "#4CC9F0", light: "#F7F3FB" },
  },
  slate: {
    label: "Corporate",
    colors: { dark: "#1E293B", primary: "#2563EB", accent: "#0EA5E9", pop: "#F59E0B", light: "#F8FAFC" },
  },
  mono: {
    label: "Monochrome",
    colors: { dark: "#1A1A1A", primary: "#4A4A4A", accent: "#8A8A8A", pop: "#E63946", light: "#F5F5F5" },
  },
} as const satisfies Record<string, { label: string; colors: MotionPalette }>;
/** "auto" lets the planner choose colors to suit the subject. */
export type MotionPaletteChoice = "auto" | keyof typeof MOTION_PALETTES | "custom";

export const MOTION_RESOLUTIONS = {
  "720p": { label: "720p (faster)", width: 1280, height: 720 },
  "1080p": { label: "1080p (sharper, slower to render)", width: 1920, height: 1080 },
} as const;
export type MotionResolution = keyof typeof MOTION_RESOLUTIONS;

export const MAX_CHARACTER_CHARS = 220;
export const MAX_CLOSING_CHARS = 160;

/**
 * How characters and props move once they have arrived. The planner picks an
 * idle per actor; this decides which of its picks survive.
 */
export const MOTION_MOVEMENTS = {
  gentle: { label: "Gentle float", blurb: "a slow drift, no bouncing" },
  lively: { label: "Lively", blurb: "floats and small bounces" },
  still: { label: "Still", blurb: "no movement after they arrive" },
} as const;
export type MotionMovement = keyof typeof MOTION_MOVEMENTS;

export type MotionOptions = {
  length: MotionLength;
  tone: MotionTone;
  audience: MotionAudience;
  visual: MotionVisual;
  palette: MotionPaletteChoice;
  /** Used when palette is "custom". */
  customPalette?: MotionPalette;
  /** "auto" lets the planner design one, "none" leaves the video to props. */
  character: "auto" | "custom" | "none";
  /** Used when character is "custom". */
  characterDescription?: string;
  /** A call to action for the closing card, taken as given. */
  closing?: string;
  resolution: MotionResolution;
  /** Idle movement of characters and props after they arrive. */
  movement: MotionMovement;
};

export const DEFAULT_MOTION_OPTIONS: MotionOptions = {
  length: "standard",
  tone: "friendly",
  audience: "general",
  visual: "flat",
  palette: "auto",
  character: "auto",
  resolution: "720p",
  movement: "gentle",
};

function keyOf<T extends object>(table: T, v: unknown, fallback: keyof T): keyof T {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(table, v)
    ? (v as keyof T)
    : fallback;
}

/**
 * Coerce request options into something the planner and build can trust.
 * Accepts `palette` as "auto", a preset name, "custom" with `customPalette`, or
 * a palette object directly; and `character` as "auto", "none", "custom" with
 * `characterDescription`, or a description directly.
 */
export function normalizeMotionOptions(raw: unknown): MotionOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Loose;
  const d = DEFAULT_MOTION_OPTIONS;

  let palette: MotionPaletteChoice = d.palette;
  let customPalette: MotionPalette | undefined;
  if (o.palette && typeof o.palette === "object") {
    palette = "custom";
    customPalette = normalizePalette(o.palette);
  } else if (o.palette === "custom") {
    palette = "custom";
    customPalette = normalizePalette(o.customPalette);
  } else if (typeof o.palette === "string" && o.palette in MOTION_PALETTES) {
    palette = o.palette as MotionPaletteChoice;
  }

  let character: MotionOptions["character"] = "auto";
  let characterDescription: string | undefined;
  const c = str(o.character).trim();
  if (c === "none") character = "none";
  else if (c && c !== "auto") {
    const described = c === "custom" ? str(o.characterDescription) : c;
    characterDescription = clip(cleanText(described), MAX_CHARACTER_CHARS) || undefined;
    if (characterDescription) character = "custom";
  }

  const closing = clip(cleanText(str(o.closing)), MAX_CLOSING_CHARS) || undefined;

  return {
    length: keyOf(MOTION_LENGTHS, o.length, d.length),
    tone: keyOf(MOTION_TONES, o.tone, d.tone),
    audience: keyOf(MOTION_AUDIENCES, o.audience, d.audience),
    visual: keyOf(MOTION_VISUALS, o.visual ?? o.visualStyle, d.visual),
    palette,
    ...(customPalette ? { customPalette } : {}),
    character,
    ...(characterDescription ? { characterDescription } : {}),
    ...(closing ? { closing } : {}),
    resolution: keyOf(MOTION_RESOLUTIONS, o.resolution, d.resolution),
    movement: keyOf(MOTION_MOVEMENTS, o.movement, d.movement),
  };
}

/** Apply the chosen movement to every actor: the planner's idles are only suggestions. */
export function applyMovement(plan: MotionPlan, movement: MotionMovement): MotionPlan {
  if (movement === "lively") return plan;
  return {
    ...plan,
    scenes: plan.scenes.map((s) => ({
      ...s,
      actors: s.actors.map((a) => ({
        ...a,
        idle: movement === "still" ? "none" : a.idle === "bob" ? "float" : a.idle,
      })),
    })),
  };
}

/** The palette an option set pins, or null when the planner chooses. */
export function fixedPalette(opts: MotionOptions): MotionPalette | null {
  if (opts.palette === "custom") return opts.customPalette ?? null;
  if (opts.palette === "auto") return null;
  return { ...MOTION_PALETTES[opts.palette].colors };
}

/** One line for the player, listing only what differs from the defaults. */
export function describeMotionOptions(opts: MotionOptions | undefined): string[] {
  if (!opts) return [];
  const d = DEFAULT_MOTION_OPTIONS;
  const out: string[] = [];
  if (opts.length !== d.length) out.push(MOTION_LENGTHS[opts.length].label.split(" (")[0]);
  if (opts.tone !== d.tone) out.push(MOTION_TONES[opts.tone].label);
  if (opts.audience !== d.audience) out.push(`for ${MOTION_AUDIENCES[opts.audience].label.toLowerCase()}`);
  if (opts.visual !== d.visual) out.push(MOTION_VISUALS[opts.visual].label);
  if (opts.palette === "custom") out.push("custom colors");
  else if (opts.palette !== "auto") out.push(`${MOTION_PALETTES[opts.palette].label} colors`);
  if (opts.character === "none") out.push("no character");
  else if (opts.character === "custom") out.push("custom character");
  if (opts.closing) out.push("custom closing");
  if (opts.resolution !== d.resolution) out.push(opts.resolution);
  if (opts.movement && opts.movement !== d.movement) {
    out.push(`${MOTION_MOVEMENTS[opts.movement].label.toLowerCase()} motion`);
  }
  return out;
}

function storyArc(len: MotionLength): string {
  const { how } = MOTION_LENGTHS[len];
  const howLine =
    how === 1
      ? "3. how — the single most important mechanism or step."
      : `3-${2 + how}. how — one mechanism or step each, in order.`;
  return [
    "1. problem — the pain or question the sources address, made concrete.",
    "2. solution — what the sources propose, introduced by name if they give one.",
    howLine,
    `${3 + how}. benefits — the payoff, with a number from the sources if there is one.`,
    `${4 + how}. cta — the one next step a viewer should take, as the sources describe it.`,
  ].join("\n");
}

function lookRules(opts: MotionOptions): string {
  const palette = fixedPalette(opts);
  const paletteRule = palette
    ? `The palette is fixed. Return exactly: ${JSON.stringify(palette)}.`
    : "Pick a palette that suits the subject: one dark color for text, a primary and\n" +
      "two accents, and a very light background color. Hex values only.";
  const heroRule =
    opts.character === "none"
      ? 'There is no recurring character in this video. Set "hero" to an empty string\n' +
        'and never use an actor of kind "hero": tell the story with props and settings.'
      : opts.character === "custom"
        ? `The hero is fixed. Return it as "hero" exactly: "${opts.characterDescription}".`
        : "The hero is one recurring cartoon person who appears in most scenes. Describe\n" +
          "their clothes and colors concretely so every drawing matches. Never a real\n" +
          "person, never a celebrity, never a mascot from a real company.";
  return `${paletteRule}\n${heroRule}`;
}

export const MOTION_PLAN_INSTRUCTION = (
  topic: string,
  opts: MotionOptions = DEFAULT_MOTION_OPTIONS
) => `You are a scriptwriter and art director for 2D motion-graphics explainer videos:
characters and objects slide and pop into simple scenes, bold headlines animate
on, and a narrator tells a short story.

Plan a ${MOTION_LENGTHS[opts.length].scenes}-scene video from the sources${topic ? `, focused on: ${topic}` : ""}.
It is for ${MOTION_AUDIENCES[opts.audience].rule}.
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
${storyArc(opts.length)}

THE LOOK
${lookRules(opts)}

ACTORS
At most two per scene, in different placements.${
  opts.character === "none" ? "" : " Use the hero in about half the scenes or more."
} A prop is ONE object a designer could draw in a minute: "an
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
${MOTION_TONES[opts.tone].rule} Two or three sentences per scene. Close the cta
scene on the next step, not a sign-off. No markdown, no citation markers, no
stage directions: every character is read aloud.
${
  opts.closing
    ? `
CLOSING CALL TO ACTION
The user supplied the closing message below. Build the cta scene around it: its
headline and subline should state it, and its narration should say it plainly.
Because the user wrote it, any link or contact detail in it may be used as given.
"${opts.closing}"
`
    : ""
}
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
 * across the video. Choices the user pinned in `opts` (palette, character,
 * look) win over whatever the model returned. Returns null when too little
 * survives to make a video.
 */
export function normalizeMotionPlan(
  raw: Loose,
  opts: MotionOptions = DEFAULT_MOTION_OPTIONS
): MotionPlan | null {
  const style = (raw.style && typeof raw.style === "object" ? raw.style : {}) as Loose;
  const noHero = opts.character === "none";
  const hero = noHero
    ? ""
    : opts.character === "custom" && opts.characterDescription
      ? opts.characterDescription
      : clip(cleanText(str(style.hero)), MAX_CHARACTER_CHARS) || DEFAULT_HERO;

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
        if (a.kind === "hero") return !noHero;
        if (props >= MAX_PROPS) return false;
        props++;
        return true;
      }),
    }));

  if (scenes.length < 3) return null;
  return {
    title: clip(cleanText(str(raw.title, "Motion explainer")), 80) || "Motion explainer",
    description: cleanText(str(raw.description)),
    style: {
      palette: fixedPalette(opts) ?? normalizePalette(style.palette),
      hero,
      visual: opts.visual,
    },
    scenes,
  };
}

const paletteWords = (p: MotionPalette) =>
  `${p.primary}, ${p.accent}, ${p.pop}, ${p.dark} and ${p.light}`;

/** Shared by every asset so the backgrounds, hero and props look like one film. */
export function styleBase(style: MotionStyle): string {
  const look = (MOTION_VISUALS[style.visual] ?? MOTION_VISUALS.flat).look;
  return (
    `${look} Limited palette built from ${paletteWords(style.palette)}. ` +
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
    `${styleBase(style)} One full-body character: ${style.hero}. Standing, ` +
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
