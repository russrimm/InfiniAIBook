/**
 * Picking an infographic style to suit the sources, like NotebookLM's
 * automatic style choice — but as a suggestion the user can see and override,
 * never a silent switch.
 */

import {
  INFOGRAPHIC_STYLES,
  STYLE_META,
  STYLE_ORDER,
  knownStyle,
  type InfographicStyle,
} from "./infographic";

export type StyleSuggestion = { style: InfographicStyle; reason: string };

export const MAX_SUGGESTIONS = 3;

/** The style menu as the model sees it: key, name and what it suits. */
export function styleMenu(): string {
  return STYLE_ORDER.map(
    (k) => `- ${k}: ${INFOGRAPHIC_STYLES[k].label} — ${INFOGRAPHIC_STYLES[k].blurb}. Best for ${STYLE_META[k].bestFor.toLowerCase()}.`
  ).join("\n");
}

export function suggestionPrompt(topic: string): string {
  return `You choose infographic formats. Read the source excerpts and pick the
${MAX_SUGGESTIONS} styles from the menu below whose STRUCTURE best fits what the
sources actually contain${topic ? `, focusing on: ${topic}` : ""}. Prefer a
structure-led style when the material clearly has that shape — dated events
suit "timeline", repeated stages suit "cycle", two options suit "comparison",
many comparable figures suit "data", ordered steps suit "process", graded
levels suit "pyramid" or "funnel", misconceptions suit "myths", vocabulary
suits "cheatsheet". Choose three different styles, best first.

MENU
${styleMenu()}

Respond with a single JSON object only:
{ "suggestions": [{ "style": menu key, "reason": why it fits these sources, at most 14 words }] }`;
}

/** Keeps only known, distinct styles with a short reason. */
export function parseSuggestions(raw: unknown): StyleSuggestion[] {
  const list = (raw as { suggestions?: unknown })?.suggestions;
  if (!Array.isArray(list)) return [];
  const seen = new Set<InfographicStyle>();
  const out: StyleSuggestion[] = [];
  for (const item of list) {
    const o = (item ?? {}) as { style?: unknown; reason?: unknown };
    const style = knownStyle(o.style);
    if (!style || seen.has(style)) continue;
    seen.add(style);
    const reason =
      typeof o.reason === "string" && o.reason.trim()
        ? o.reason.trim().replace(/\s+/g, " ").slice(0, 140)
        : STYLE_META[style].bestFor;
    out.push({ style, reason });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * A model-free guess from the shape of the text, used when the model is
 * unavailable so the button still does something sensible.
 */
export function heuristicSuggestions(text: string): StyleSuggestion[] {
  const t = text.toLowerCase();
  const words = Math.max(1, t.split(/\s+/).length);
  const per1k = (n: number) => (n / words) * 1000;

  const scores: [InfographicStyle, number, string][] = [
    [
      "timeline",
      per1k(
        count(t, /\b(1[89]\d\d|20\d\d)\b/g) +
          count(t, /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)
      ),
      "The sources are full of dates and events in order",
    ],
    [
      "data",
      per1k(count(t, /\d+(?:[.,]\d+)?\s?(?:%|percent|million|billion|k\b)/g)),
      "The sources state many comparable figures",
    ],
    [
      "comparison",
      per1k(count(t, /\b(vs\.?|versus|compared (?:to|with)|whereas|on the other hand)\b/g)) * 3,
      "The sources weigh options against each other",
    ],
    [
      "process",
      per1k(count(t, /\b(step \d|first|then|next|finally|afterwards)\b/g)),
      "The sources describe steps in order",
    ],
    [
      "myths",
      per1k(count(t, /\b(myth|misconception|contrary to|in fact|actually)\b/g)) * 3,
      "The sources correct common misunderstandings",
    ],
    [
      "checklist",
      per1k(count(t, /\b(should|must|make sure|remember to|ensure)\b/g)),
      "The sources are full of things to do",
    ],
  ];
  const picks = scores
    .filter(([, s]) => s > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([style, , reason]) => ({ style, reason }));
  for (const fallback of [
    { style: "guide" as const, reason: "A visual overview of the key ideas" },
    { style: "illustrated" as const, reason: "Each idea drawn as a visual metaphor" },
    { style: "bento" as const, reason: "One main conclusion with supporting points" },
  ]) {
    if (picks.length >= MAX_SUGGESTIONS) break;
    if (!picks.some((p) => p.style === fallback.style)) picks.push(fallback);
  }
  return picks.slice(0, MAX_SUGGESTIONS);
}
