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

import { METAPHOR_HINTS, METAPHOR_KEYS } from "./metaphors";

export type InfographicStyle =
  | "illustrated"
  | "image"
  | "classic"
  | "flat"
  | "data"
  | "process"
  | "comparison"
  | "checklist"
  | "educational"
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
export type InfographicLayout =
  | "stack"
  | "bento"
  | "flow"
  | "editorial"
  | "compare"
  | "checklist"
  | "data"
  | "illustrated"
  | "image";

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

/** Metaphor vocabulary, listed for the prompt so the model picks a real key. */
const METAPHOR_LIST = METAPHOR_KEYS.map(
  (k) => `  ${k} — ${METAPHOR_HINTS[k]}`
).join("\n");

export const INFOGRAPHIC_STYLES: Record<InfographicStyle, StyleDef> = {
  /**
   * The default. A wide editorial piece that turns each idea into a visual
   * metaphor rather than a box of prose, grouped into a few thematic regions.
   */
  illustrated: {
    label: "Illustrated",
    blurb: "Editorial, visual metaphors",
    icon: "🖼️",
    layout: "illustrated",
    hint: `Analyse the material and identify the 6-10 most important ideas. Do not
restate paragraphs — turn each idea into something that can be shown.

Populate "regions" with 2-3 thematic groups, each { "heading": 2-4 words,
"concepts": [...] }, distributing the ideas between them. Each concept is
{ "takeaway": a bold claim of 3-8 words, "detail": 1-3 short sentences with a
citation marker, "metaphor": one key from the list below, "value": an optional
short figure taken literally from the sources, e.g. "68%", "$2.4B", "12 weeks" }.

Choose "metaphor" by what the idea *is*, not by decoration:
${METAPHOR_LIST}

Set "value" only where the sources state a real figure — it is rendered
oversized, so an invented or vague number is conspicuous. Leave it out otherwise.
Give "takeaway" the weight: it is read first and set in bold.
Keep "sections" empty; "regions" replaces it for this style.
"title" is one strong headline. "subtitle" is a single line of context.`,
    theme: {
      bg: "#f7faf9",
      surface: "#ffffff",
      border: "#d4e2e4",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 16,
      text: "#2c3e4c",
      muted: "#61798a",
      heading: "#0f2233",
      accent: "#0e7490",
      accent2: "#15803d",
      headerBg: "#f7faf9",
      headerText: "#0b1b2b",
      headerSubText: "#51677a",
      statValue: "#0e7490",
      font: SANS,
      headingFont: SANS,
      shadow: "0 10px 24px -18px rgba(15,34,51,0.45)",
    },
  },

  /**
   * Generated as a real image by an image model, from the same grounded brief
   * the illustrated style produces. The brief is kept alongside the PNG so the
   * citations remain, which a bare image cannot carry.
   */
  image: {
    label: "AI image",
    blurb: "Rendered by an image model",
    icon: "✨",
    layout: "image",
    hint: `Analyse the material and identify the 6-9 most important ideas. Do not
restate paragraphs — turn each idea into something that can be drawn.

Populate "regions" with exactly 3 thematic groups, each { "heading": 1-3 words in
upper case, "concepts": [...] }. Each concept is { "takeaway": a bold claim of
3-7 words, "detail": ONE short sentence with a citation marker, "metaphor": one
key from the list below, "value": an optional short figure taken literally from
the sources, e.g. "68%", "$2.4B", "12 weeks" }.

Choose "metaphor" by what the idea *is*, not by decoration:
${METAPHOR_LIST}

This brief is rendered as a drawn illustration, so text must be short enough to
survive being lettered by hand: keep every takeaway under 45 characters and every
detail under 110. Set "value" only where the sources state a real figure.
Keep "sections" empty; "regions" replaces it for this style.
"title" is one strong headline of at most 60 characters. "subtitle" is a single
line of context.`,
    theme: {
      bg: "#f7faf9",
      surface: "#ffffff",
      border: "#d4e2e4",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 16,
      text: "#2c3e4c",
      muted: "#61798a",
      heading: "#0f2233",
      accent: "#0e7490",
      accent2: "#15803d",
      headerBg: "#f7faf9",
      headerText: "#0b1b2b",
      headerSubText: "#51677a",
      statValue: "#0e7490",
      font: SANS,
      headingFont: SANS,
      shadow: "0 10px 24px -18px rgba(15,34,51,0.45)",
    },
  },

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

  /**
   * Merged from two near-identical ideas: the isometric "connected system" and
   * the classic numbered process flow. Both were an ordered left-to-right
   * sequence, so keeping them apart would have been a palette swap pretending
   * to be a format. This keeps the isometric sense of depth and connection, and
   * the process emphasis on direction and action — and, unlike either original,
   * attaches each stage's detail to the stage itself instead of stranding a row
   * of chips above unrelated cards.
   */
  process: {
    label: "Process flow",
    blurb: "Numbered stages, each with detail",
    icon: "🔗",
    layout: "flow",
    hint: `Treat the material as an ordered process of 4-6 connected stages.
Populate "flow" with the stage names in order, 2-4 words each, phrased as actions
("Capture light", "Fix carbon") rather than nouns.
Provide exactly one section per stage, in the same order, with the same heading
as the stage name. Each section's bullets explain what happens at that stage and
what it produces for the next one — make the hand-off between stages explicit.`,
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

  data: {
    label: "Data-driven",
    blurb: "Stats, chart, then insights",
    icon: "📈",
    layout: "data",
    hint: `Lead with the numbers. Provide 4 stats as headline figures.
Also populate "chart" with 3-6 entries that are directly comparable on one scale,
each { "label": short name (<= 24 chars), "value": number, "display": the figure
written compactly, 10 characters or fewer, e.g. "13%", "27 min", "3 weeks" }.
Never put a sentence in "display".
Only include figures the sources actually state — if they are not comparable on a
single scale, omit "chart" entirely rather than inventing one.
Then give 2-3 sections of brief interpretation: what the numbers mean and what
trend they show.`,
    theme: {
      bg: "#f6f8fb",
      surface: "#ffffff",
      border: "#d5dfea",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 8,
      text: "#2f3c4b",
      muted: "#6b7b8d",
      heading: "#101d2b",
      accent: "#0f766e",
      accent2: "#0ea5e9",
      headerBg: "linear-gradient(135deg, #0f766e, #0ea5e9)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.88)",
      statValue: "#0f766e",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(16,29,43,0.06)",
    },
  },

  comparison: {
    label: "Comparison",
    blurb: "Two options, side by side",
    icon: "⚖️",
    layout: "compare",
    hint: `Compare the two main options, positions or approaches the sources
discuss. Populate "compare" with { "aLabel", "bLabel", "rows": [{ "feature",
"a", "b" }], "verdict" }. Give 3-5 rows, each a single point of difference with a
short phrase for each side. "verdict" is one balanced sentence on when each is
preferable — not a winner unless the sources clearly support one.
Only compare things the sources genuinely set against each other; if there is no
real comparison to make, say so in the subtitle and leave "compare" out.
Keep "sections" to at most two, for context either side cannot cover alone.`,
    theme: {
      bg: "#f7f7f9",
      surface: "#ffffff",
      border: "#dcdfe6",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 8,
      text: "#333a45",
      muted: "#6f7784",
      heading: "#16191f",
      accent: "#7c3aed",
      accent2: "#0891b2",
      headerBg: "#16191f",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.82)",
      statValue: "#7c3aed",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(22,25,31,0.05)",
    },
  },

  checklist: {
    label: "Checklist",
    blurb: "Actionable items to work through",
    icon: "✅",
    layout: "checklist",
    hint: `Turn the material into something the reader can act on.
Populate "checklist" with 6-10 entries of { "title": a bold imperative of 2-6
words, "detail": one short sentence of explanation with a citation }.
Order them the way someone would actually work through them.
Every item must come from the sources — do not pad the list to reach a count.
Keep "sections" to at most one, and "stats" to at most two.`,
    theme: {
      bg: "#f6faf7",
      surface: "#ffffff",
      border: "#cfe3d6",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 10,
      text: "#31423a",
      muted: "#6c8177",
      heading: "#14241c",
      accent: "#16a34a",
      accent2: "#0d9488",
      headerBg: "linear-gradient(135deg, #16a34a, #0d9488)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.9)",
      statValue: "#16a34a",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(20,36,28,0.05)",
    },
  },

  educational: {
    label: "Educational",
    blurb: "What it is, why, how to apply",
    icon: "🎓",
    layout: "stack",
    hint: `Teach the concept in exactly three sections, headed "What it is",
"Why it matters" and "How to apply it", in that order. Give each 2-3 bullets.
The first defines plainly, the second gives consequence or significance, the
third gives concrete application. The takeaway is the one thing to remember.`,
    theme: {
      bg: "#fffaf3",
      surface: "#ffffff",
      border: "#eddfc8",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#413628",
      muted: "#7e705c",
      heading: "#291f13",
      accent: "#c2410c",
      accent2: "#ca8a04",
      headerBg: "linear-gradient(135deg, #c2410c, #ca8a04)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.9)",
      statValue: "#c2410c",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(41,31,19,0.05)",
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
  "illustrated",
  "image",
  "classic",
  "flat",
  "data",
  "process",
  "comparison",
  "checklist",
  "educational",
  "bento",
  "corporate",
  "minimal",
  "editorial",
  "neon",
  "cutout",
  "clay",
  "sketch",
  "chalkboard",
  "watercolor",
];

/** Styles folded into another; kept so existing artifacts still render. */
const ALIASES: Record<string, InfographicStyle> = {
  isometric: "process",
};

/** What new infographics use unless the user picks otherwise. */
export const DEFAULT_STYLE: InfographicStyle = "illustrated";

export function styleDef(style?: string): StyleDef {
  // Artifacts created before styles existed have no key and no regions, so
  // they must keep resolving to the original look rather than the new default.
  if (!style) return INFOGRAPHIC_STYLES.classic;
  const key = ALIASES[style] ?? (style as InfographicStyle);
  return INFOGRAPHIC_STYLES[key] ?? INFOGRAPHIC_STYLES.classic;
}

type BriefConcept = {
  takeaway?: string;
  detail?: string;
  metaphor?: string;
  value?: string;
};
type BriefRegion = { heading?: string; concepts?: BriefConcept[] };

/**
 * Turns the grounded brief into an image prompt.
 *
 * Every line of text handed to the model is quoted from the brief, which is
 * itself derived from the sources — the image model is told to letter it
 * verbatim rather than invent copy, because it cannot be cited after the fact.
 */
export function buildImagePrompt(content: {
  title?: string;
  subtitle?: string;
  regions?: BriefRegion[];
}): string {
  const strip = (s: string) =>
    // Citation markers are for the HTML renderer; lettered into an image they
    // read as stray digits.
    s.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "").replace(/\s+/g, " ").trim();

  const regions = (content.regions ?? []).slice(0, 3).map((r, i) => {
    const concepts = (r.concepts ?? []).slice(0, 3).map((c) => {
      const bits = [`      - Takeaway: "${strip(c.takeaway || "")}"`];
      if (c.detail) bits.push(`        Supporting line: "${strip(c.detail)}"`);
      if (c.value) bits.push(`        Oversized figure: "${strip(c.value)}"`);
      if (c.metaphor)
        bits.push(
          `        Draw as: ${
            METAPHOR_HINTS[c.metaphor as keyof typeof METAPHOR_HINTS] ?? c.metaphor
          }`
        );
      return bits.join("\n");
    });
    return `  Region ${i + 1} — ${strip(r.heading || "").toUpperCase()}\n${concepts.join("\n")}`;
  });

  return `Create a NotebookLM-style illustrated infographic.

Convert each concept below into an intuitive visual metaphor, diagram, process
illustration, comparison, gauge, timeline or mini visualization. Do not simply
place paragraphs into boxes.

COMPOSITION: a wide landscape editorial infographic, roughly 2:1. One large
centered headline at the top. Divide the information into the ${regions.length} thematic
regions given below, each with a bold section heading. Build a visual journey
through the information rather than a rigid grid of cards. Connect related
concepts with subtle colored lines, arrows, paths or flows.

HIERARCHY: each concept shows its bold takeaway, an illustration that
communicates the idea, and at most one short supporting sentence. Figures marked
as oversized must be rendered dramatically large.

ILLUSTRATION STYLE: polished modern editorial vector illustration; friendly
technical aesthetic; slightly dimensional objects; dark navy outlines; rounded
geometry; subtle gradients; soft shadows; a blue, cyan, teal and green primary
palette with orange and yellow used selectively for emphasis. Very light
off-white background with subtle blue/green regional tinting. Generous
whitespace.

TYPOGRAPHY: large bold black sans-serif headline; bold section headings; strong
black subheads; highly readable supporting text. Avoid excessive text.

The result should resemble a premium illustrated technology infographic produced
for an enterprise publication — not a PowerPoint slide, dashboard, poster or a
collection of UI cards.

TEXT IS EXACT. Letter every string below verbatim, spelled correctly. Do not
invent, paraphrase, translate or add any other words, numbers, labels, captions,
logos or watermarks. If a word would not fit, make the illustration smaller
rather than shortening the word.

HEADLINE: "${strip(content.title || "")}"${
    content.subtitle ? `\nSUBHEAD: "${strip(content.subtitle)}"` : ""
  }

CONTENT:
${regions.join("\n\n")}`;
}
