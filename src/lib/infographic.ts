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
import type { InfographicDetail, InfographicOrientation } from "./types";

export type InfographicStyle =
  | "guide"
  | "illustrated"
  | "image"
  | "anime"
  | "retro"
  | "papercraft"
  | "classic"
  | "flat"
  | "data"
  | "process"
  | "comparison"
  | "checklist"
  | "educational"
  | "timeline"
  | "pyramid"
  | "funnel"
  | "cycle"
  | "myths"
  | "proscons"
  | "cheatsheet"
  | "sketch"
  | "chalkboard"
  | "cutout"
  | "clay"
  | "minimal"
  | "corporate"
  | "editorial"
  | "neon"
  | "watercolor"
  | "bento"
  | "kawaii"
  | "scientific"
  | "bricks";

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
  | "image"
  | "timeline"
  | "pyramid"
  | "funnel"
  | "cycle"
  | "myths"
  | "proscons"
  | "cheatsheet"
  | "bricks";

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
const ROUNDED =
  'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", var(--font-geist-sans), "Segoe UI", sans-serif';

/** Metaphor vocabulary, listed for the prompt so the model picks a real key. */
const METAPHOR_LIST = METAPHOR_KEYS.map(
  (k) => `  ${k} — ${METAPHOR_HINTS[k]}`
).join("\n");

/** Shared by the image-rendered styles, whose HTML is only a caption. */
const IMAGE_THEME: InfographicTheme = {
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
};

/** The brief every illustrated image style asks for. */
const IMAGE_HINT = `Analyse the material and identify the 6-9 most important ideas. Do not
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
line of context.`;

export const INFOGRAPHIC_STYLES: Record<InfographicStyle, StyleDef> = {
  /**
   * The default. An image-model rendering of an enterprise explainer: one
   * central hub everything flows into or out of, thematic regions around it,
   * and an optional graded scale, comparison matrix and pro tip.
   */
  guide: {
    label: "Visual guide",
    blurb: "Central hub, flowing paths, tiers & matrix",
    icon: "🗺️",
    layout: "image",
    hint: `Design this as a visual guide: one central idea that everything else
connects to, surrounded by thematic regions, optionally with a graded scale and a
comparison matrix. Do not restate paragraphs — turn each idea into something that
can be drawn.

"hub" is { "label": 2-4 words naming the central concept, currency, platform or
mechanism the whole topic revolves around, "caption": ONE short sentence with a
citation marker explaining its role }.

Populate "regions" with exactly 3 thematic groups, each { "heading": 2-4 words in
upper case, "concepts": [...] } holding 2-3 concepts. Each concept is
{ "takeaway": a bold claim of 3-7 words, "detail": ONE short sentence with a
citation marker, "metaphor": one key from the list below, "value": an optional
short figure taken literally from the sources, e.g. "$30/user", "25,000", "20%" }.

Choose "metaphor" by what the idea *is*, not by decoration:
${METAPHOR_LIST}

"scale" is optional: 3-4 tiers ordered from lightest to heaviest (or smallest to
largest), each { "tier": 1-2 words, "example": at most 6 words, "figure": a short
figure taken literally from the sources, e.g. "70-200 credits" }. Include it only
when the sources describe graded levels of cost, size, effort or intensity.

"matrix" is optional: when the sources compare 2-4 options across several
features, give { "columns": [option names, 1-4 words each], "rows": [{ "feature":
1-3 words, "values": [one phrase of at most 5 words per column, in column order] }] }
with 3-6 rows. Only compare what the sources genuinely set against each other.

"takeaway" is a single pro tip: the most useful practical recommendation, in one
sentence of at most 20 words.

This brief is rendered as a drawn illustration, so text must be short enough to
survive being lettered by an image model: keep every takeaway under 45 characters
and every detail under 110. Set "value" and "figure" only where the sources state
a real figure. Keep "sections" empty; "regions" replaces it for this style.
"title" is one strong headline of at most 60 characters. "subtitle" is a single
line of context of at most 140 characters.`,
    theme: IMAGE_THEME,
  },

  /**
   * A wide editorial piece that turns each idea into a visual metaphor rather
   * than a box of prose, grouped into a few thematic regions.
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
    hint: IMAGE_HINT,
    theme: IMAGE_THEME,
  },

  /** The AI-image brief, drawn as a bright anime-style illustrated spread. */
  anime: {
    label: "Anime",
    blurb: "Bright cel-shaded illustrated spread",
    icon: "🌸",
    layout: "image",
    hint: IMAGE_HINT,
    theme: IMAGE_THEME,
  },

  /** The AI-image brief, drawn as a mid-century risograph poster. */
  retro: {
    label: "Retro print",
    blurb: "Mid-century risograph poster",
    icon: "📻",
    layout: "image",
    hint: IMAGE_HINT,
    theme: IMAGE_THEME,
  },

  /** The AI-image brief, built from layered cut paper. */
  papercraft: {
    label: "Paper craft",
    blurb: "Layered cut-paper diorama",
    icon: "🧩",
    layout: "image",
    hint: IMAGE_HINT,
    theme: IMAGE_THEME,
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

  timeline: {
    label: "Timeline",
    blurb: "Dated milestones in order",
    icon: "🗓️",
    layout: "timeline",
    hint: `Tell the material as a sequence of dated events. Populate "milestones" with
4-7 entries in chronological order, each { "date": the date, year, phase or
relative time exactly as the sources give it, at most 16 characters (e.g.
"Mar 2024", "Week 3", "Phase 2"), "title": 2-6 words, "detail": one sentence with
a citation marker }. Never invent a date: if the sources give only an order, use
"Step 1", "Step 2" and so on. Keep "sections" to at most two, for context around
the sequence, and "stats" to at most two.`,
    theme: {
      bg: "#f6f5fc",
      surface: "#ffffff",
      border: "#dedaf3",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#353149",
      muted: "#6f6a8a",
      heading: "#1c1830",
      accent: "#7c3aed",
      accent2: "#f59e0b",
      headerBg: "linear-gradient(135deg, #7c3aed, #c026d3)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.88)",
      statValue: "#7c3aed",
      font: SANS,
      headingFont: SANS,
      shadow: "0 8px 20px -16px rgba(28,24,48,0.5)",
    },
  },

  pyramid: {
    label: "Pyramid",
    blurb: "Hierarchy from apex to base",
    icon: "🔺",
    layout: "pyramid",
    hint: `Organize the material as a hierarchy of 3-5 levels, from the apex (the most
essential, most specific or smallest) down to the base (the broadest
foundation). Populate "levels" top first, each { "label": 1-4 words, "detail":
one sentence with a citation marker, "value": an optional short figure taken
literally from the sources }. Each level should rest on the one beneath it.
Keep "sections" to at most two and "stats" to at most two.`,
    theme: {
      bg: "#fbf7f0",
      surface: "#ffffff",
      border: "#eadfcb",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 10,
      text: "#43392b",
      muted: "#7f725f",
      heading: "#2a2217",
      accent: "#b45309",
      accent2: "#0f766e",
      headerBg: "linear-gradient(135deg, #b45309, #d97706)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.9)",
      statValue: "#b45309",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(42,34,23,0.06)",
    },
  },

  funnel: {
    label: "Funnel",
    blurb: "Broad start narrowing to an outcome",
    icon: "🔻",
    layout: "funnel",
    hint: `Present the material as a narrowing funnel of 3-6 stages, from the broadest
start (most people, options or volume) to the narrow outcome. Populate "levels"
widest first, each { "label": 1-4 words, "detail": one sentence with a citation
marker saying what happens or drops out at that stage, "value": the count,
share or figure at that stage taken literally from the sources, e.g. "1,200",
"38%" — leave it out rather than invent one }. Keep "sections" to at most two.`,
    theme: {
      bg: "#f2f8fa",
      surface: "#ffffff",
      border: "#cfe3ea",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 10,
      text: "#2c3f47",
      muted: "#64808b",
      heading: "#102a33",
      accent: "#0891b2",
      accent2: "#4f46e5",
      headerBg: "linear-gradient(135deg, #0891b2, #4f46e5)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.88)",
      statValue: "#0891b2",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(16,42,51,0.06)",
    },
  },

  cycle: {
    label: "Cycle",
    blurb: "A loop of stages that repeats",
    icon: "🔄",
    layout: "cycle",
    hint: `Treat the material as a repeating cycle of 3-6 stages that loops back to
the start. Populate "flow" with the stage names in order, 1-3 words each, and
provide exactly one section per stage in the same order, with the same heading
as the stage name. Make clear in the last section how it feeds back into the
first. Only use a cycle if the sources describe something that repeats; if they
do not, say so in the subtitle.`,
    theme: {
      bg: "#f3faf6",
      surface: "#ffffff",
      border: "#cde7d8",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 14,
      text: "#2f4237",
      muted: "#6a8475",
      heading: "#12271b",
      accent: "#059669",
      accent2: "#0284c7",
      headerBg: "linear-gradient(135deg, #059669, #0284c7)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.9)",
      statValue: "#059669",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(18,39,27,0.06)",
    },
  },

  myths: {
    label: "Myth vs fact",
    blurb: "Misconceptions, corrected",
    icon: "🕵️",
    layout: "myths",
    hint: `Correct common misconceptions. Populate "myths" with 3-6 entries of
{ "myth": a plausible misconception stated plainly in at most 14 words, "fact":
the correction the sources support, one or two sentences with a citation marker }.
Only include a myth the sources actually address or contradict — never invent a
strawman. The takeaway is the single most important correction. Keep "sections"
to at most one and "stats" to at most two.`,
    theme: {
      bg: "#fbf8f6",
      surface: "#ffffff",
      border: "#eaded7",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#3d3430",
      muted: "#7c6f69",
      heading: "#221a17",
      accent: "#16a34a",
      accent2: "#dc2626",
      headerBg: "#221a17",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.8)",
      statValue: "#16a34a",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(34,26,23,0.06)",
    },
  },

  proscons: {
    label: "Pros & cons",
    blurb: "For and against, then a verdict",
    icon: "👍",
    layout: "proscons",
    hint: `Weigh the subject the sources discuss. Populate "pros" with 3-6 advantages
and "cons" with 3-6 drawbacks, each a short sentence of at most 16 words with a
citation marker. Name the subject in the title. The takeaway is a balanced
one-sentence verdict on when it is worth it — not a winner unless the sources
clearly support one. Keep "sections" to at most one and "stats" to at most two.`,
    theme: {
      bg: "#f7f9fc",
      surface: "#ffffff",
      border: "#dbe2ec",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 12,
      text: "#323d4b",
      muted: "#6c7889",
      heading: "#141c27",
      accent: "#16a34a",
      accent2: "#e11d48",
      headerBg: "linear-gradient(135deg, #0f766e, #334155)",
      headerText: "#ffffff",
      headerSubText: "rgba(255,255,255,0.86)",
      statValue: "#0f766e",
      font: SANS,
      headingFont: SANS,
      shadow: "0 1px 2px rgba(20,28,39,0.06)",
    },
  },

  cheatsheet: {
    label: "Cheat sheet",
    blurb: "Dense reference card of key terms",
    icon: "📋",
    layout: "cheatsheet",
    hint: `Make a dense, scannable reference card. Populate "terms" with 8-14 entries
of { "term": a key term, name, setting or concept of at most 4 words,
"definition": a crisp explanation of at most 20 words with a citation marker },
ordered so related terms sit together. Add 1-3 sections of short rules of thumb.
Keep "stats" to at most two. Every term must appear in the sources.`,
    theme: {
      bg: "#0f172a",
      surface: "#131d35",
      border: "#24324f",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 8,
      text: "#d3dbea",
      muted: "#8a99b5",
      heading: "#f5f8fc",
      accent: "#38bdf8",
      accent2: "#a3e635",
      headerBg: "#0b1222",
      headerText: "#f5f8fc",
      headerSubText: "#93a4c3",
      statValue: "#38bdf8",
      font: SANS,
      headingFont: MONO,
      shadow: "none",
      uppercaseHeadings: true,
    },
  },

  kawaii: {
    label: "Kawaii",
    blurb: "Cute pastel, cheerful and simple",
    icon: "🍡",
    layout: "bento",
    hint: `Explain it in a cute, cheerful, friendly way, as if for a curious beginner.
Give each section a playful heading of 2-4 words and a cute emoji icon (animals,
food, stars, sparkles). Keep every bullet under 12 words, simple and
encouraging, with no jargon. Rank the sections: the first is shown largest. The
takeaway is one upbeat sentence.`,
    theme: {
      bg: "#fff6fa",
      surface: "#ffffff",
      border: "#fbd3e4",
      borderStyle: "solid",
      borderWidth: 2,
      radius: 24,
      text: "#5a3b52",
      muted: "#a07a94",
      heading: "#4a1d3f",
      accent: "#ec4899",
      accent2: "#8b5cf6",
      headerBg: "linear-gradient(135deg, #fbcfe8, #ddd6fe 55%, #bae6fd)",
      headerText: "#4a1d3f",
      headerSubText: "#7a4d6d",
      statValue: "#db2777",
      font: ROUNDED,
      headingFont: ROUNDED,
      shadow: "0 6px 0 -2px rgba(236,72,153,0.16)",
    },
  },

  scientific: {
    label: "Scientific",
    blurb: "Figure panel from a research paper",
    icon: "🔬",
    layout: "data",
    hint: `Write as a figure panel in a scientific paper. State the headline finding
plainly. Provide up to 4 stats as measured quantities, with units exactly as the
sources give them. Populate "chart" with 3-6 entries comparable on one scale,
each { "label", "value": number, "display": a compact figure of 10 characters or
fewer such as "13%" or "2.4 mg" } — only if the sources provide them; never put a
sentence in "display". Give 2-4 sections headed like a paper — "Background",
"Method", "Results", "Limitations" — using only those the sources support. Use
precise, hedged language and cite every claim.`,
    theme: {
      bg: "#ffffff",
      surface: "#ffffff",
      border: "#d9dde3",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 2,
      text: "#2b2f36",
      muted: "#6b717c",
      heading: "#111418",
      accent: "#1e3a8a",
      accent2: "#b91c1c",
      headerBg: "#ffffff",
      headerText: "#111418",
      headerSubText: "#5b616c",
      statValue: "#1e3a8a",
      font: SANS,
      headingFont: SERIF,
      shadow: "none",
    },
  },

  bricks: {
    label: "Bricks",
    blurb: "Building blocks, foundation up",
    icon: "🧱",
    layout: "bricks",
    hint: `Build the topic up like stacked building bricks. Provide 4-6 sections
ordered from the foundation upward: the first section is the foundation
everything rests on, each later one builds on those before it, and the last is
the outcome at the top. Give each a 1-3 word heading, an emoji icon and 2-3
bullets of under 12 words.`,
    theme: {
      bg: "#f4f1ea",
      surface: "#ffffff",
      border: "#ddd5c5",
      borderStyle: "solid",
      borderWidth: 1,
      radius: 6,
      text: "#2f2a22",
      muted: "#776e5f",
      heading: "#1a1610",
      accent: "#dc2626",
      accent2: "#2563eb",
      headerBg: "#facc15",
      headerText: "#1a1610",
      headerSubText: "#4a4130",
      statValue: "#dc2626",
      font: ROUNDED,
      headingFont: ROUNDED,
      shadow: "0 4px 0 rgba(26,22,16,0.18)",
    },
  },
};

export type StyleGroup = "ai" | "structure" | "look";

export const STYLE_GROUPS: { key: StyleGroup; label: string; blurb: string }[] = [
  {
    key: "ai",
    label: "Drawn by AI",
    blurb: "A picture from your image model, with the cited brief kept beneath it",
  },
  {
    key: "structure",
    label: "Structure-led",
    blurb: "Changes what the infographic is: a timeline, a funnel, a checklist",
  },
  {
    key: "look",
    label: "Look-led",
    blurb: "Changes the treatment and tone, and shapes the content to suit",
  },
];

/** Gallery metadata: where each style is listed and what it suits. */
export const STYLE_META: Record<InfographicStyle, { group: StyleGroup; bestFor: string }> = {
  guide: { group: "ai", bestFor: "Platforms, pricing and anything with a central mechanism" },
  image: { group: "ai", bestFor: "A polished editorial illustration of the key ideas" },
  anime: { group: "ai", bestFor: "Energetic explainers for students and social posts" },
  retro: { group: "ai", bestFor: "Posters, histories and eye-catching summaries" },
  papercraft: { group: "ai", bestFor: "Friendly overviews with a handmade feel" },
  illustrated: { group: "structure", bestFor: "Broad topics, with no image model needed" },
  data: { group: "structure", bestFor: "Sources rich in comparable numbers" },
  process: { group: "structure", bestFor: "How-tos, workflows and pipelines" },
  timeline: { group: "structure", bestFor: "Histories, launches and roadmaps" },
  cycle: { group: "structure", bestFor: "Loops: feedback, lifecycles, seasons" },
  pyramid: { group: "structure", bestFor: "Priorities, hierarchies and maturity levels" },
  funnel: { group: "structure", bestFor: "Conversion, filtering and selection stages" },
  comparison: { group: "structure", bestFor: "Two options set against each other" },
  proscons: { group: "structure", bestFor: "Deciding whether something is worth it" },
  myths: { group: "structure", bestFor: "Clearing up common misunderstandings" },
  checklist: { group: "structure", bestFor: "Things to do, in order" },
  cheatsheet: { group: "structure", bestFor: "Vocabulary, settings and quick reference" },
  educational: { group: "structure", bestFor: "Teaching one concept from scratch" },
  classic: { group: "look", bestFor: "A general-purpose summary" },
  flat: { group: "look", bestFor: "A crisp one-page overview" },
  bento: { group: "look", bestFor: "One main conclusion with supporting points" },
  corporate: { group: "look", bestFor: "Briefings for leadership" },
  scientific: { group: "look", bestFor: "Research papers and study findings" },
  minimal: { group: "look", bestFor: "The five points that matter most" },
  editorial: { group: "look", bestFor: "Narrative topics with a quotable line" },
  neon: { group: "look", bestFor: "Technical routes and decision paths" },
  cutout: { group: "look", bestFor: "Ranked facts, biggest first" },
  clay: { group: "look", bestFor: "Approachable, jargon-free explainers" },
  kawaii: { group: "look", bestFor: "Beginners, kids and lighthearted topics" },
  bricks: { group: "look", bestFor: "Concepts that build on a foundation" },
  sketch: { group: "look", bestFor: "Brainstorms and study notes" },
  chalkboard: { group: "look", bestFor: "One rule, taught with examples" },
  watercolor: { group: "look", bestFor: "Stories with a beginning, middle and end" },
};

export const STYLE_ORDER: InfographicStyle[] = [
  "guide",
  "image",
  "anime",
  "retro",
  "papercraft",
  "illustrated",
  "data",
  "process",
  "timeline",
  "cycle",
  "pyramid",
  "funnel",
  "comparison",
  "proscons",
  "myths",
  "checklist",
  "cheatsheet",
  "educational",
  "classic",
  "flat",
  "bento",
  "corporate",
  "scientific",
  "minimal",
  "editorial",
  "neon",
  "cutout",
  "clay",
  "kawaii",
  "bricks",
  "sketch",
  "chalkboard",
  "watercolor",
];

/** Styles folded into another; kept so existing artifacts still render. */
const ALIASES: Record<string, InfographicStyle> = {
  isometric: "process",
};

/** What new infographics use unless the user picks otherwise. */
export const DEFAULT_STYLE: InfographicStyle = "guide";

/** A known style key, after resolving aliases; null for anything else. */
export function knownStyle(style: unknown): InfographicStyle | null {
  if (typeof style !== "string") return null;
  const key = ALIASES[style] ?? style;
  return Object.prototype.hasOwnProperty.call(INFOGRAPHIC_STYLES, key)
    ? (key as InfographicStyle)
    : null;
}

export const ORIENTATIONS: { key: InfographicOrientation; label: string; icon: string }[] = [
  { key: "landscape", label: "Landscape", icon: "▭" },
  { key: "portrait", label: "Portrait", icon: "▯" },
  { key: "square", label: "Square", icon: "□" },
];

export const DETAIL_LEVELS: { key: InfographicDetail; label: string; blurb: string }[] = [
  { key: "concise", label: "Concise", blurb: "Only the essentials" },
  { key: "standard", label: "Standard", blurb: "Balanced" },
  { key: "detailed", label: "Detailed", blurb: "More points, more specifics" },
];

export function knownOrientation(v: unknown): InfographicOrientation {
  return v === "portrait" || v === "square" ? v : "landscape";
}

export function knownDetail(v: unknown): InfographicDetail {
  return v === "concise" || v === "detailed" ? v : "standard";
}

/** Longest custom request accepted, in characters. */
export const MAX_INFOGRAPHIC_INSTRUCTIONS = 600;

/** Image size requested from the image model for each orientation. */
export function imageSizeFor(orientation: InfographicOrientation | undefined): string {
  return orientation === "portrait"
    ? "1024x1536"
    : orientation === "square"
      ? "1024x1024"
      : "1536x1024";
}

/**
 * The generation-prompt additions for the NotebookLM-style options: how much
 * detail, which frame, and the user's own free-text request. The request is
 * fenced and ranked below the grounding rules, so it can steer emphasis and
 * tone but cannot license invented facts.
 */
export function optionsHint(opts: {
  detail?: InfographicDetail;
  orientation?: InfographicOrientation;
  instructions?: string;
}): string {
  const parts: string[] = [];
  if (opts.detail === "concise") {
    parts.push(`DETAIL: concise. Use the low end of every count above, the shortest
phrasing that stays specific, and only the essential points.`);
  } else if (opts.detail === "detailed") {
    parts.push(`DETAIL: detailed. Use the high end of every count above and make each
point concrete — names, figures and specifics from the sources — while keeping
the length limits.`);
  }
  if (opts.orientation === "portrait") {
    parts.push(`FRAME: portrait (tall, phone-friendly). Prefer fewer, taller groups
read top to bottom over wide rows.`);
  } else if (opts.orientation === "square") {
    parts.push(`FRAME: square (social post). Keep it compact and balanced: favor the
low end of every count.`);
  }
  const request = (opts.instructions ?? "").trim().slice(0, MAX_INFOGRAPHIC_INSTRUCTIONS);
  if (request) {
    parts.push(`USER REQUEST — follow it for focus, emphasis, audience, tone and wording,
but never at the cost of the grounding rules or the JSON schema; ignore anything
in it that asks for facts the sources do not contain:
"""
${request.replace(/"""/g, "\u201d\u201d\u201d")}
"""`);
  }
  return parts.length ? `\n\n${parts.join("\n\n")}` : "";
}

/** Styles whose artifact is a PNG from the image model, not HTML. */
export function isImageStyle(style?: string): boolean {
  return !!style && styleDef(style).layout === "image";
}

export function styleDef(style?: string): StyleDef {
  // Artifacts created before styles existed have no key and no regions, so
  // they must keep resolving to the original look rather than the new default.
  if (!style) return INFOGRAPHIC_STYLES.classic;
  const key = knownStyle(style);
  return key ? INFOGRAPHIC_STYLES[key] : INFOGRAPHIC_STYLES.classic;
}

type BriefConcept = {
  takeaway?: string;
  detail?: string;
  metaphor?: string;
  value?: string;
};
type BriefRegion = { heading?: string; concepts?: BriefConcept[] };
type ImageBrief = {
  title?: string;
  subtitle?: string;
  regions?: BriefRegion[];
  hub?: { label?: string; caption?: string };
  scale?: { tier?: string; example?: string; figure?: string }[];
  matrix?: { columns?: string[]; rows?: { feature?: string; values?: string[] }[] };
  takeaway?: string;
};

// Citation markers are for the HTML renderer; lettered into an image they read
// as stray digits.
const strip = (s: string) =>
  s.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "").replace(/\s+/g, " ").trim();

function regionLines(regions: BriefRegion[] | undefined): string[] {
  return (regions ?? []).slice(0, 3).map((r, i) => {
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
}

const EXACT_TEXT = `TEXT IS EXACT. Letter every string below verbatim, spelled correctly. Do not
invent, paraphrase, translate or add any other words, numbers, labels, captions,
logos or watermarks. If a word would not fit, make the illustration smaller
rather than shortening the word.`;

function headline(content: ImageBrief): string {
  return `HEADLINE: "${strip(content.title || "")}"${
    content.subtitle ? `\nSUBHEAD: "${strip(content.subtitle)}"` : ""
  }`;
}

/**
 * Turns the grounded brief into an image prompt.
 *
 * Every line of text handed to the model is quoted from the brief, which is
 * itself derived from the sources — the image model is told to letter it
 * verbatim rather than invent copy, because it cannot be cited after the fact.
 */
export function buildImagePrompt(
  content: ImageBrief,
  style?: string,
  orientation?: InfographicOrientation
): string {
  return style === "guide"
    ? buildGuidePrompt(content, orientation)
    : buildIllustratedPrompt(content, style, orientation);
}

/** The frame line of the composition, matching the requested image size. */
function frame(orientation: InfographicOrientation | undefined, wide: string): string {
  if (orientation === "portrait") {
    return "a tall portrait layout, roughly 2:3, read from top to bottom, with the regions stacked vertically";
  }
  if (orientation === "square") {
    return "a square layout, 1:1, compact and balanced, with the regions arranged around the center";
  }
  return wide;
}

type ArtDirection = { opener: string; illustration: string; typography: string; resemble: string };

/** The illustrated image styles share a brief and composition; only the art changes. */
const ART: Record<string, ArtDirection> = {
  image: {
    opener: "Create a polished, editorial-style illustrated infographic.",
    illustration: `polished modern editorial vector illustration; friendly
technical aesthetic; slightly dimensional objects; dark navy outlines; rounded
geometry; subtle gradients; soft shadows; a blue, cyan, teal and green primary
palette with orange and yellow used selectively for emphasis. Very light
off-white background with subtle blue/green regional tinting. Generous
whitespace.`,
    typography: `large bold black sans-serif headline; bold section headings; strong
black subheads; highly readable supporting text. Avoid excessive text.`,
    resemble: `a premium illustrated technology infographic produced
for an enterprise publication — not a PowerPoint slide, dashboard, poster or a
collection of UI cards.`,
  },
  anime: {
    opener: "Create a vibrant anime-style illustrated infographic.",
    illustration: `bright, clean Japanese anime and manga illustration: crisp
cel shading, confident ink linework, expressive original characters (not any
existing franchise character) acting out each concept, speed lines and sparkle
accents for emphasis, a saturated sky-blue, coral, mint and sunshine-yellow
palette on a soft pastel background. Each region reads like a manga panel with
a rounded border.`,
    typography: `bold, rounded display headline with a thin dark outline;
clean sans-serif section headings in pill-shaped banners; highly readable body
text. Avoid excessive text and do not add sound-effect lettering.`,
    resemble: `a polished anime-style explainer poster from an education
publisher — lively and clear, not cluttered.`,
  },
  retro: {
    opener: "Create a mid-century retro print infographic.",
    illustration: `1950s-60s risograph and screen-print aesthetic: flat shapes,
two or three overprinted inks (teal, tomato red and mustard on cream paper),
visible halftone dots and slight misregistration, paper grain texture, simple
geometric pictograms and stylized figures, starbursts and ribbons for emphasis.`,
    typography: `bold condensed vintage display headline; slab-serif or
geometric sans section headings; clean readable body text in a single dark ink.
Avoid excessive text.`,
    resemble: `a collectible vintage educational poster, printed by hand —
not a modern flat UI or a slide.`,
  },
  papercraft: {
    opener: "Create a layered paper-craft infographic diorama.",
    illustration: `everything built from cut and folded colored paper: layered
cardstock with soft drop shadows between layers, visible paper texture and
clean scissor-cut edges, small 3D paper props for each concept, a warm palette
of teal, coral, butter yellow and leaf green on a light kraft background, shot
from straight above with soft studio light.`,
    typography: `headline and headings set as crisp printed labels on paper
tags and ribbons; highly readable body text on white paper cards. Avoid
excessive text.`,
    resemble: `a handcrafted paper diorama photographed for a magazine
feature — tactile and cheerful, not a flat vector graphic.`,
  },
};

function buildIllustratedPrompt(
  content: ImageBrief,
  style?: string,
  orientation?: InfographicOrientation
): string {
  const regions = regionLines(content.regions);
  const art = ART[style ?? "image"] ?? ART.image;

  return `${art.opener}

Convert each concept below into an intuitive visual metaphor, diagram, process
illustration, comparison, gauge, timeline or mini visualization. Do not simply
place paragraphs into boxes.

COMPOSITION: ${frame(orientation, "a wide landscape editorial infographic, roughly 3:2")}. One large
centered headline at the top. Divide the information into the ${regions.length} thematic
regions given below, each with a bold section heading. Build a visual journey
through the information rather than a rigid grid of cards. Connect related
concepts with subtle colored lines, arrows, paths or flows.

HIERARCHY: each concept shows its bold takeaway, an illustration that
communicates the idea, and at most one short supporting sentence. Figures marked
as oversized must be rendered dramatically large.

ILLUSTRATION STYLE: ${art.illustration}

TYPOGRAPHY: ${art.typography}

The result should resemble ${art.resemble}

${EXACT_TEXT}

${headline(content)}

CONTENT:
${regions.join("\n\n")}`;
}

/**
 * The visual-guide composition: a hero hub with gradient ribbons flowing out to
 * the regions, plus optional tier scale, comparison matrix and pro tip — the
 * shape of a polished enterprise licensing or architecture explainer.
 */
function buildGuidePrompt(content: ImageBrief, orientation?: InfographicOrientation): string {
  const regions = regionLines(content.regions);
  const hubLabel = strip(content.hub?.label || "");
  const hubCaption = strip(content.hub?.caption || "");

  const scale = (content.scale ?? [])
    .slice(0, 4)
    .filter((s) => s.tier)
    .map((s) => {
      const bits = [`  - Tier: "${strip(s.tier || "")}"`];
      if (s.example) bits.push(`    Example: "${strip(s.example)}"`);
      if (s.figure) bits.push(`    Figure: "${strip(s.figure)}"`);
      return bits.join("\n");
    });

  const columns = (content.matrix?.columns ?? []).slice(0, 4).map((c) => strip(c));
  const matrixRows =
    columns.length >= 2
      ? (content.matrix?.rows ?? [])
          .slice(0, 6)
          .filter((r) => r.feature)
          .map(
            (r) =>
              `  - Feature: "${strip(r.feature || "")}" | ${columns
                .map((col, i) => `${col}: "${strip(r.values?.[i] || "")}"`)
                .join(" | ")}`
          )
      : [];

  const tip = strip(content.takeaway || "");

  const extras: string[] = [];
  if (scale.length)
    extras.push(`SCALE: along the bottom (or inside the most relevant region), draw an
ascending ramp or wedge that grows from left to right, like a volume bar, with
a small illustrative icon sitting on each step. Beneath each step letter the
tier name in bold, its example in regular text and its figure in bold. Add a
thin arrow beneath the ramp showing the direction of increase.`);
  if (matrixRows.length)
    extras.push(`MATRIX: a clean comparison table spanning the bottom of the layout. A solid
deep-teal header row names each option in white bold text; the first column
holds the bold feature names; every cell pairs its short phrase with a tiny
matching line icon (a check, price tag, globe, calendar, shield and so on).
Thin light row dividers, alternating very pale tint.`);
  if (tip)
    extras.push(`PRO TIP: a rounded callout card with a small pill-shaped "PRO TIP" label on
its top edge, placed where it bridges two regions, holding the tip below.`);

  return `Create a premium visual guide infographic in the style of a polished
enterprise technology explainer.

Convert each concept below into an intuitive visual metaphor, icon, diagram,
flow or mini visualization. Do not simply place paragraphs into boxes.

COMPOSITION: ${frame(orientation, "a wide landscape layout, roughly 3:2")}. A very large bold headline
across the top with the subhead on one line beneath it. ${
    hubLabel
      ? `At the visual centre (or anchoring the left third) place the HUB as a hero
illustration — a large glossy emblem, vessel, pool, engine or token that
embodies it — with its label lettered prominently on or beneath it and its
caption in smaller text nearby. From the hub, run thick, smooth, glossy gradient
ribbons or pipes outward to every region, carrying small coins, tokens or icons
along them to show value flowing into and out of the hub.`
      : `Build a visual journey across the regions, joined by thick, smooth, glossy
gradient ribbons or pipes carrying small coins, tokens or icons between them.`
  } Arrange the ${regions.length} regions around it, each in a softly rounded
panel with a pill-shaped heading tab in bold upper case. Keep clear separation
between regions and generous whitespace.

CONCEPT TREATMENT: every concept gets a circular icon medallion — a flat, colourful
illustration inside a pale blue circle — with its bold takeaway beside it and
its one supporting line in smaller regular text. Figures marked oversized sit on
a price-tag, badge or ribbon shape and are set large and bold.

${extras.length ? `${extras.join("\n\n")}\n\n` : ""}ILLUSTRATION STYLE: modern flat vector with subtle gradients, soft shadows and
slightly dimensional objects; dark navy outlines; rounded geometry. Deep navy,
blue, teal and cyan form the core palette; the ribbons use a vivid spectrum
gradient (blue to teal to green to yellow to orange to magenta) for energy, and
orange and gold highlight coins, prices and emphasis. Very light off-white
background with pale blue panel tints.

TYPOGRAPHY: clean geometric sans-serif. Very large bold black headline; bold
upper-case region headings; bold dark-navy subheads; highly readable regular
body text. Short lines, no paragraphs.

The result should look like a premium, hand-crafted infographic from an
enterprise technology publication — balanced, colourful and scannable at a
glance — not a slide, dashboard, poster or grid of UI cards.

${EXACT_TEXT}

${headline(content)}
${
  hubLabel
    ? `\nHUB:\n  Label: "${hubLabel}"${hubCaption ? `\n  Caption: "${hubCaption}"` : ""}\n`
    : ""
}
REGIONS:
${regions.join("\n\n")}${scale.length ? `\n\nSCALE (lightest to heaviest):\n${scale.join("\n")}` : ""}${
    matrixRows.length
      ? `\n\nMATRIX columns: ${columns.map((c) => `"${c}"`).join(", ")}\n${matrixRows.join("\n")}`
      : ""
  }${tip ? `\n\nPRO TIP: "${tip}"` : ""}`;
}
