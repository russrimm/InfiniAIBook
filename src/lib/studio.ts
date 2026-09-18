import type { ArtifactType } from "./types";

export const GROUNDING_RULES = `
You are OpenNotebook, a research assistant that answers ONLY from the provided source excerpts.
Rules:
- Use only facts present in the excerpts. Never invent details, numbers, names or dates.
- Cite evidence with bracketed markers matching the excerpt numbers, e.g. [1] or [2][5].
- If the excerpts do not cover something, say so plainly instead of guessing.
- Write in clear, neutral, specific prose. No filler or self-reference.
`.trim();

type Spec = {
  label: string;
  blurb: string;
  icon: string;
  json: boolean;
  /** Extra instruction appended after the shared grounding rules. */
  instruction: (topic: string) => string;
};

const jsonNote =
  "Respond with a single JSON object only. No markdown fences, no commentary.";

export const STUDIO: Record<ArtifactType, Spec> = {
  report: {
    label: "Report",
    blurb: "In-depth structured write-up",
    icon: "📄",
    json: true,
    instruction: (topic) => `Write a thorough analytical report${topic ? ` focused on: ${topic}` : ""}.
${jsonNote}
Schema:
{
  "title": string,
  "subtitle": string,
  "markdown": string  // full report body in GitHub-flavored Markdown
}
The markdown must contain: an executive summary, 3-6 "## " sections with substantive analysis,
a "## Key takeaways" bulleted list, and a "## Open questions" list of what the sources do not answer.
Use inline citation markers like [2] throughout. Use tables where they aid comparison.`,
  },

  briefing: {
    label: "Briefing doc",
    blurb: "Executive one-pager",
    icon: "🧾",
    json: true,
    instruction: (topic) => `Write a tight executive briefing${topic ? ` about: ${topic}` : ""}.
${jsonNote}
Schema: { "title": string, "subtitle": string, "markdown": string }
The markdown must be under 700 words with: "## Bottom line" (3 sentences max),
"## What the sources say" (bullets with citations), "## Risks & caveats", "## Recommended next steps".`,
  },

  study_guide: {
    label: "Study guide",
    blurb: "Concepts, terms, practice",
    icon: "🎓",
    json: true,
    instruction: (topic) => `Create a study guide${topic ? ` for: ${topic}` : ""}.
${jsonNote}
Schema: { "title": string, "subtitle": string, "markdown": string }
The markdown must include: "## Core concepts" (each concept with a 2-3 sentence explanation and citation),
"## Glossary" (markdown table of term | definition), "## Short-answer questions" (10 numbered questions),
"## Answer key" (matching numbered answers).`,
  },

  faq: {
    label: "FAQ",
    blurb: "Questions readers will ask",
    icon: "❓",
    json: true,
    instruction: (topic) => `Produce the frequently asked questions the sources actually answer${
      topic ? `, focused on: ${topic}` : ""
    }.
${jsonNote}
Schema: { "title": string, "items": [{ "q": string, "a": string }] }
Provide 8-12 items. Each answer is 2-5 sentences with citation markers. Order from most to least fundamental.`,
  },

  quiz: {
    label: "Quiz",
    blurb: "Multiple-choice knowledge check",
    icon: "🧠",
    json: true,
    instruction: (topic) => `Write a multiple-choice quiz that tests real comprehension of the sources${
      topic ? `, focused on: ${topic}` : ""
    }.
${jsonNote}
Schema:
{
  "title": string,
  "questions": [{
    "question": string,
    "choices": [string, string, string, string],
    "answerIndex": number,   // 0-3
    "explanation": string    // why the answer is right, with a citation marker
  }]
}
Provide 10 questions. Every question must be answerable from the excerpts.
Distractors must be plausible and drawn from the same subject matter, never nonsense.
Vary the position of the correct answer across questions.`,
  },

  mindmap: {
    label: "Mind map",
    blurb: "Hierarchical concept tree",
    icon: "🕸️",
    json: true,
    instruction: (topic) => `Build a mind map of the source material${topic ? ` centred on: ${topic}` : ""}.
${jsonNote}
Schema:
{
  "title": string,
  "root": { "label": string, "note": string, "children": [ { "label": string, "note": string, "children": [...] } ] }
}
Rules: the root is the central theme. 4-7 first-level branches. Each branch has 2-5 children.
Depth must not exceed 3 levels below the root. Labels are 1-5 words. "note" is an optional
single short sentence with a citation marker.`,
  },

  timeline: {
    label: "Timeline",
    blurb: "Chronology of events",
    icon: "🗓️",
    json: true,
    instruction: (topic) => `Extract a chronological timeline from the sources${topic ? ` about: ${topic}` : ""}.
${jsonNote}
Schema: { "title": string, "items": [{ "date": string, "title": string, "text": string }] }
Use 6-15 items in chronological order. "date" is whatever precision the sources give
(e.g. "2019", "Q3 2021", "March 4, 2022", or a phase name if no dates exist).
"text" is 1-3 sentences with a citation marker. Only include events actually stated in the excerpts.`,
  },

  infographic: {
    label: "Infographic",
    blurb: "Visual stats & highlights",
    icon: "📊",
    json: true,
    instruction: (topic) => `Design a visual infographic summarising the sources${topic ? ` about: ${topic}` : ""}.
${jsonNote}
Schema:
{
  "title": string,             // punchy, <= 60 chars
  "subtitle": string,          // one line of context
  "accent": string,            // one of "indigo", "emerald", "amber", "rose", "sky", "violet"
  "stats": [{ "value": string, "label": string, "caption": string }],
  "sections": [{ "heading": string, "icon": string, "bullets": [string] }],
  "takeaway": string
}
Rules: 3-4 stats whose "value" is a short figure taken literally from the sources
(e.g. "68%", "$2.4B", "3x", "12 weeks"); never fabricate a number — if the sources have
few numbers, use counts of things the sources enumerate. 3-4 sections, each with 2-4 short
bullets (<= 14 words each) and a single emoji as "icon". "takeaway" is one memorable sentence.
Include citation markers inside bullets and stat captions.`,
  },
};

export const STUDIO_ORDER: ArtifactType[] = [
  "report",
  "briefing",
  "infographic",
  "mindmap",
  "quiz",
  "study_guide",
  "faq",
  "timeline",
];
