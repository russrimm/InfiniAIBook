/**
 * Infographic styles.
 *
 * Each style carries two things: a visual theme used by the renderer, and a
 * content-shape hint used when generating. The shapes matter as much as the
 * palette — a chalkboard lesson wants one rule and three examples, a corporate
 * report wants a metric callout and next steps.
 *
 * These render as real HTML rather than a generated image, so the text stays
 * selectable, the citations stay clickable, and nothing is misspelled by a
 * diffusion model.
 */

export type InfographicStyle =
  | "classic"
  | "flat"
  | "isometric"
  | "sketch"
  | "chalkboard"
  | "cutout"
  | "clay"
  | "minimal"
  | "corporate"
  | "editorial"
  | "neon"
  | "watercolor"
  | "bento";

/** How the body of the infographic is arranged. */
export type InfographicLayout = "stack" | "bento" | "flow" | "editorial";

export type InfographicTheme = {
  bg: string;
  surface: string;
  border: string;
  borderStyle: "solid" | "dashed";
  borderWidth: number;
  radius: number;
  text: string;
  muted: string;
  heading: string;
  accent: string;
  accent2: string;
  headerBg: string;
  headerText: string;
  headerSubText: string;
  statValue: string;
  font: string;
  headingFont: string;
  shadow: string;
  texture?: string;
  letterSpacing?: string;
  uppercaseHeadings?: boolean;
  glow?: boolean;
};

export type StyleDef = {
  label: string;
  blurb: string;
  icon: string;
  layout: InfographicLayout;
  /** Appended to the generation prompt to shape the content, not just the look. */
  hint: string;
  theme: InfographicTheme;
};

const SANS =
  'var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const MONO = 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace';
const CASUAL =
  '"Segoe Print", "Bradley Hand", "Comic Sans MS", ui-rounded, cursive, sans-serif';

export const INFOGRAPHIC_STYLES: Record<InfographicStyle, StyleDef> = {
  classic: {
    label: "Classic",
    blurb: "Dark studio default",
    icon: "📊",
    layout: "stack",
    hint: "",
    theme: {
      bg: "#0e1116",
      surface: "#12151a",
      border: "#242a33",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#d7dde6",
      muted: "#8b95a5",
      heading: "#f2f5f9",
      accent: "#6366f1",
      accent2: "#8b5cf6",
      headerBg: "linear-gradient(135deg, #6366f1, #8b5cf6)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.85)",
      statValue: "#a5b4fc",
      font: SANS,
      headingFont: SANS,
      shadow: "none",
    },
  },

  flat: {
    label: "Flat vector",
    blurb: "Geometric, generous white space",
    icon: "🔷",
    layout: "stack",
    hint: `Lead with the single key takeaway — it is printed at the top in this style.
Provide 5-7 labelled facts in total across the sections, each a short declarative
statement. Keep headings to one or two words.`,
    theme: {
      bg: "#f7f8fa",
      surface: "#ffffff",
      border: "#dfe3ea",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 4,
      text: "#2b3440",
      muted: "#6b7686",
      heading: "#131a24",
      accent: "#2563eb",
      accent2: "#0ea5e9",
      headerBg: "#2563eb",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.88)",
      statValue: "#2563eb",
      font: SANS,
      headingFont: SANS,
      shadow: "none",
    },
  },

  isometric: {
    label: "Isometric system",
    blurb: "Connected parts, left to right",
    icon: "🧊",
    layout: "flow",
    hint: `Treat the material as a connected system of 4-6 parts that flow in order.
Populate "flow" with those parts as short ordered stage names (2-4 words each),
and let each section describe one stage. Emphasise how one stage feeds the next.`,
    theme: {
      bg: "#eef1f7",
      surface: "#ffffff",
      border: "#c9d2e3",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 10,
      text: "#2f3846",
      muted: "#69778c",
      heading: "#1b2333",
      accent: "#4f46e5",
      accent2: "#06b6d4",
      headerBg: "linear-gradient(135deg, #4f46e5, #06b6d4)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.88)",
      statValue: "#4f46e5",
      font: SANS,
      headingFont: SANS,
      shadow: "0 10px 24px -16px rgba(31,41,72,0.55)",
    },
  },

  sketch: {
    label: "Sketch note",
    blurb: "Hand-drawn clusters and arrows",
    icon: "✏️",
    layout: "stack",
    hint: `Write as hand-lettered sketch notes: cluster related ideas, keep every
bullet under 10 words, and favour punchy fragments over full sentences.
Use an expressive emoji as each section icon, like a margin doodle.`,
    theme: {
      bg: "#fdfbf4",
      surface: "#fffdf7",
      border: "#3b3a36",
      borderStyle: "dashed",
      borderWidth: 2,
      radius: 14,
      text: "#33312c",
      muted: "#6f6a60",
      heading: "#1f1e1b",
      accent: "#e0a800",
      accent2: "#d946ef",
      headerBg: "#fffdf7",
      headerText: "#1f1e1b",
      headerSubText: "#6f6a60",
      statValue: "#c2410c",
      font: CASUAL,
      headingFont: CASUAL,
      shadow: "3px 3px 0 rgba(59,58,54,0.16)",
    },
  },

  chalkboard: {
    label: "Chalkboard lesson",
    blurb: "One rule, three examples",
    icon: "🧑‍🏫",
    layout: "stack",
    hint: `Structure this as a concise classroom lesson. The takeaway is the single
central rule, stated plainly. Provide exactly three sections, each one supporting
example of that rule. Keep the tone instructional and direct.`,
    theme: {
      bg: "#1f2a26",
      surface: "rgba(255,255,255,0.045)",
      border: "rgba(255,255,255,0.22)",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 8,
      text: "#e8efe9",
      muted: "#a9bdb2",
      heading: "#ffffff",
      accent: "#ffe08a",
      accent2: "#9ad6c4",
      headerBg: "transparent",
      headerText: "#ffffff",
      headerSubText: "#bcd3c6",
      statValue: "#ffe08a",
      font: CASUAL,
      headingFont: CASUAL,
      shadow: "none",
      texture:
        "radial-gradient(circle at 20% 15%, rgba(255,255,255,0.05), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.04), transparent 40%)",
    },
  },

  cutout: {
    label: "Paper cutout",
    blurb: "Layered, biggest fact first",
    icon: "✂️",
    layout: "bento",
    hint: `Rank the material by importance: the first section must be the most
important and will be rendered largest. Keep later sections progressively
shorter. Bullets should read as single clean facts.`,
    theme: {
      bg: "#f3ece1",
      surface: "#fffaf2",
      border: "#e0d2bd",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#413729",
      muted: "#7d6f5d",
      heading: "#2b2318",
      accent: "#e07a5f",
      accent2: "#81b29a",
      headerBg: "#e07a5f",
      headerText: "#fffaf2",
      headerSubText: "rgba(255,250,242,0.9)",
      statValue: "#c2553a",
      font: SANS,
      headingFont: SANS,
      shadow: "0 8px 16px -8px rgba(65,55,41,0.35)",
    },
  },

  clay: {
    label: "Clay explainer",
    blurb: "Friendly rounded role cards",
    icon: "🫧",
    layout: "stack",
    hint: `Explain it warmly, as if introducing characters in a story. Give each
section a friendly role-style heading and one clear object or idea per bullet.
Keep captions short and approachable; avoid jargon.`,
    theme: {
      bg: "#f2eef9",
      surface: "#ffffff",
      border: "#e2daf2",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 22,
      text: "#3c3352",
      muted: "#7a6f95",
      heading: "#2a2340",
      accent: "#a78bfa",
      accent2: "#fda4af",
      headerBg: "linear-gradient(135deg, #a78bfa, #fda4af)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.92)",
      statValue: "#8b5cf6",
      font: SANS,
      headingFont: SANS,
      shadow: "0 12px 26px -14px rgba(74,58,115,0.45)",
    },
  },

  minimal: {
    label: "Minimal mono",
    blurb: "Five essential points",
    icon: "⬜",
    layout: "stack",
    hint: `Reduce the material to its five most essential points and nothing more.
Use at most three sections. Every bullet must earn its place — no restating,
no hedging. Hierarchy must be obvious at a glance.`,
    theme: {
      bg: "#ffffff",
      surface: "#ffffff",
      border: "#e6e6e6",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 0,
      text: "#333333",
      muted: "#8a8a8a",
      heading: "#000000",
      accent: "#d92f2f",
      accent2: "#d92f2f",
      headerBg: "#ffffff",
      headerText: "#000000",
      headerSubText: "#8a8a8a",
      statValue: "#d92f2f",
      font: SANS,
      headingFont: SANS,
      shadow: "none",
      letterSpacing: "0.01em",
      uppercaseHeadings: true,
    },
  },

  corporate: {
    label: "Corporate report",
    blurb: "Metric callout, next steps",
    icon: "🏢",
    layout: "stack",
    hint: `Write as a professional briefing. Provide 3-5 sections on a clear grid.
Put the single most striking figure first in "stats" — it is rendered as a
headline metric. Populate "nextSteps" with 3 practical, concrete actions.`,
    theme: {
      bg: "#f5f7fa",
      surface: "#ffffff",
      border: "#d8e0ea",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 6,
      text: "#31404f",
      muted: "#6b7c8d",
      heading: "#12212f",
      accent: "#1d4ed8",
      accent2: "#0f766e",
      headerBg: "#12314f",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.82)",
      statValue: "#1d4ed8",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(18,33,47,0.06)",
      uppercaseHeadings: true,
    },
  },

  editorial: {
    label: "Editorial feature",
    blurb: "Magazine styling, pull quote",
    icon: "📰",
    layout: "editorial",
    hint: `Write as a short magazine feature. The subtitle is a standfirst — one
evocative line. Populate "pullQuote" with the single most quotable sentence
drawn from the sources. Section headings should read like article subheads.`,
    theme: {
      bg: "#faf8f5",
      surface: "#faf8f5",
      border: "#ded8ce",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 2,
      text: "#2e2a26",
      muted: "#7a7268",
      heading: "#171410",
      accent: "#8c2f39",
      accent2: "#b08968",
      headerBg: "#faf8f5",
      headerText: "#171410",
      headerSubText: "#7a7268",
      statValue: "#8c2f39",
      font: SERIF,
      headingFont: SERIF,
      shadow: "none",
    },
  },

  neon: {
    label: "Neon network",
    blurb: "Dark map with glowing paths",
    icon: "🌐",
    layout: "flow",
    hint: `Present the material as a route or decision map. Populate "flow" with
4-6 ordered nodes (2-4 words each) showing the path through the topic, and let
sections expand on those nodes. Favour cause-and-effect phrasing.`,
    theme: {
      bg: "#07070f",
      surface: "rgba(124,58,237,0.07)",
      border: "rgba(56,189,248,0.38)",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 10,
      text: "#cfe6f5",
      muted: "#7f9ec2",
      heading: "#ffffff",
      accent: "#22d3ee",
      accent2: "#c026d3",
      headerBg: "linear-gradient(135deg, rgba(34,211,238,0.22), rgba(192,38,211,0.22))",
      headerText: "#ffffff",
      headerSubText: "#a5c9e6",
      statValue: "#22d3ee",
      font: MONO,
      headingFont: SANS,
      shadow: "0 0 22px -6px rgba(34,211,238,0.35)",
      glow: true,
      uppercaseHeadings: true,
    },
  },

  watercolor: {
    label: "Watercolor story",
    blurb: "Beginning, middle, end",
    icon: "🎨",
    layout: "editorial",
    hint: `Tell it as a gentle story with a beginning, a middle and an end: use
exactly three sections named to reflect that arc. Keep the tone calm and
narrative. Populate "pullQuote" with the line that best captures the whole arc.`,
    theme: {
      bg: "#f7f9fb",
      surface: "rgba(255,255,255,0.72)",
      border: "#dbe6ee",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 18,
      text: "#3b4655",
      muted: "#7b8a9b",
      heading: "#24303f",
      accent: "#6aa9c9",
      accent2: "#e6a4b4",
      headerBg:
        "linear-gradient(120deg, rgba(106,169,201,0.35), rgba(230,164,180,0.35), rgba(181,205,168,0.3))",
      headerText: "#24303f",
      headerSubText: "#5c6b7c",
      statValue: "#4d87a6",
      font: SERIF,
      headingFont: SERIF,
      shadow: "none",
      texture:
        "radial-gradient(circle at 12% 20%, rgba(106,169,201,0.14), transparent 42%), radial-gradient(circle at 85% 30%, rgba(230,164,180,0.14), transparent 40%), radial-gradient(circle at 55% 85%, rgba(181,205,168,0.13), transparent 45%)",
    },
  },

  bento: {
    label: "Bento grid",
    blurb: "Cards sized by importance",
    icon: "🍱",
    layout: "bento",
    hint: `Rank sections by importance — the first is rendered as the largest card
and must carry the main conclusion. Keep every bullet tight, under 12 words,
so the cards stay balanced.`,
    theme: {
      bg: "#101114",
      surface: "#191b20",
      border: "#2a2d34",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 18,
      text: "#d6d9e0",
      muted: "#8b909c",
      heading: "#ffffff",
      accent: "#f59e0b",
      accent2: "#10b981",
      headerBg: "linear-gradient(135deg, #f59e0b, #10b981)",
      headerText: "#0b0d10",
      headerSubText: "rgba(11,13,16,0.75)",
      statValue: "#fbbf24",
      font: SANS,
      headingFont: SANS,
      shadow: "0 10px 30px -18px rgba(0,0,0,0.9)",
    },
  },
};

export const STYLE_ORDER: InfographicStyle[] = [
  "classic",
  "flat",
  "bento",
  "corporate",
  "minimal",
  "editorial",
  "neon",
  "isometric",
  "cutout",
  "clay",
  "sketch",
  "chalkboard",
  "watercolor",
];

export function styleDef(style?: string): StyleDef {
  return INFOGRAPHIC_STYLES[(style as InfographicStyle) ?? "classic"] ??
    INFOGRAPHIC_STYLES.classic;
}
