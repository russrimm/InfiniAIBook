import type { ArtifactType, StudyDifficulty, StudyLength, StudyOptions } from "./types";

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
  instruction: (topic: string, opts?: StudyOptions) => string;
  /** Formats that accept the difficulty and length controls. */
  study?: boolean;
};

const jsonNote =
  "Respond with a single JSON object only. No markdown fences, no commentary.";

/**
 * Study-aid tuning. Counts are ranges rather than exact numbers because the
 * useful amount depends on how much the sources actually support — forcing a
 * precise count invites padding, which is the one thing a study aid must not do.
 */
const QUIZ_COUNT: Record<StudyLength, string> = {
  short: "5-6",
  standard: "10-12",
  long: "18-20",
};

const CARD_COUNT: Record<StudyLength, string> = {
  short: "10-12",
  standard: "18-22",
  long: "30-35",
};

const DIFFICULTY: Record<StudyDifficulty, string> = {
  easy: `Pitch this at someone meeting the material for the first time. Test
recall of clearly stated facts, definitions and headline figures. Keep the
language plain and the distinctions obvious.`,
  medium: `Pitch this at someone who has read the material once. Test
understanding rather than recall: why something follows, what a figure implies,
how two ideas relate. Distinctions should require thought but not inference
beyond the sources.`,
  hard: `Pitch this at someone preparing to be examined on the material. Test
precise distinctions, edge cases, caveats, and the relationships between
separate parts of the sources. Reward close reading — but every answer must
still be fully determined by the excerpts, never by outside knowledge.`,
};

const studyTuning = (opts: StudyOptions | undefined, counts: Record<StudyLength, string>) => {
  const length = opts?.length ?? "standard";
  const difficulty = opts?.difficulty ?? "medium";
  return { count: counts[length], guidance: DIFFICULTY[difficulty], difficulty };
};

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
    study: true,
    instruction: (topic, opts) => {
      const { count, guidance } = studyTuning(opts, QUIZ_COUNT);
      return `Write a multiple-choice quiz that tests real comprehension of the sources${
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
Provide ${count} questions. Every question must be answerable from the excerpts.
Distractors must be plausible and drawn from the same subject matter, never nonsense.
Vary the position of the correct answer across questions.

DIFFICULTY
${guidance}`;
    },
  },

  flashcards: {
    label: "Flashcards",
    blurb: "Two-sided cards for recall",
    icon: "🗂️",
    json: true,
    study: true,
    instruction: (topic, opts) => {
      const { count, guidance } = studyTuning(opts, CARD_COUNT);
      return `Build a deck of two-sided flashcards from the sources${
        topic ? `, focused on: ${topic}` : ""
      }.
${jsonNote}
Schema:
{
  "title": string,
  "subtitle": string,
  "cards": [{
    "front": string,   // the prompt: a term, question or cue
    "back": string,    // the answer, with a citation marker
    "hint": string     // optional short nudge, omit when the front is already clear
  }]
}
Provide ${count} cards.

A flashcard is not a quiz question and not a summary. The front must be a single
cue that can be recalled in a few seconds — a term, a name, a date, a short
question. Never put the answer in the front, and never write a front that only
makes sense with the back already visible.

The back must be the shortest complete answer: one or two sentences, under 200
characters where possible, with a citation marker. Do not restate the front.

One idea per card. If something needs three sentences to answer, it is two cards.
Order the deck so foundational cards come before ones that build on them.

DIFFICULTY
${guidance}`;
    },
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
  "takeaway": string,
  "pullQuote": string,         // optional: the single most quotable line
  "nextSteps": [string],       // optional: 3 concrete actions
  "flow": [string],            // optional: ordered stage names, 2-4 words each
  "chart": [{ "label": string, "value": number, "display": string }],
  "compare": { "aLabel": string, "bLabel": string,
               "rows": [{ "feature": string, "a": string, "b": string }],
               "verdict": string },
  "checklist": [{ "title": string, "detail": string }],
  "regions": [{ "heading": string,
                "concepts": [{ "takeaway": string, "detail": string,
                               "metaphor": string, "value": string }] }]
}
Rules: 3-4 stats whose "value" is a short figure taken literally from the sources
(e.g. "68%", "$2.4B", "3x", "12 weeks"); never fabricate a number — if the sources have
few numbers, use counts of things the sources enumerate. 3-4 sections, each with 2-4 short
bullets (<= 14 words each) and a single emoji as "icon". "takeaway" is one memorable sentence.
Include citation markers inside bullets and stat captions.
Omit "pullQuote", "nextSteps", "flow", "chart", "compare", "checklist" and "regions"
unless the style guidance below asks for them.`,
  },

  podcast: {
    label: "Audio overview",
    blurb: "Two-host conversation",
    icon: "🎧",
    json: true,
    instruction: (topic) => `Write a two-host audio overview of the sources${
      topic ? `, focused on: ${topic}` : ""
    }.
${jsonNote}
Schema:
{
  "title": string,        // episode title, <= 70 chars; do not use the words "podcast" or "episode"
  "description": string,  // one sentence on what a listener will learn
  "turns": [{ "speaker": "a" | "b", "text": string }]
}
Hosts: "a" drives the conversation and asks the questions. "b" is the analyst who
explains and supplies detail.

Rules:
- 16-24 turns, strictly alternating, starting with "a".
- This is spoken aloud: no markdown, bullets, headings, citation markers, URLs,
  emoji or stage directions. Write only the words to be said.
- Spell out anything a text-to-speech voice would mangle: "about 68 percent" not
  "~68%", "carbon dioxide" not "CO2", "three times" not "3x".
- Open by naming the subject concretely — never "welcome to the show".
- Ground every claim in the excerpts, attributing naturally in speech, e.g.
  "the paper puts it at about a third". If the sources disagree, say so.
- Close on the single thing worth remembering, not a sign-off.

WRITE IT AS SPEECH, NOT PROSE READ ALOUD
The difference between an audio overview that sounds human and one that sounds
like a document being narrated is almost entirely in the writing.

- Vary turn length hard. A two-word reaction ("Really?", "That's the part I'd
  push back on") next to a five-sentence explanation is what a conversation
  sounds like. Uniform paragraphs are what a report sounds like.
- Use contractions throughout. "It's", "they'd", "that isn't" — never the
  expanded forms unless the word is being stressed.
- Let the hosts interrupt the shape of their own sentences. Start a thought,
  qualify it, then land it: "It's cheaper — well, cheaper per unit — but the
  setup cost is brutal."
- Open some turns the way people actually open them: "Right, so", "OK but",
  "See, that's", "Here's the thing", "I mean". Not every turn. Roughly one in
  three.
- Let "a" react before asking the next thing, rather than moving straight on.
- Use em dashes for the places a speaker would break stride, and an ellipsis
  where they would trail off. These are rendered as real pauses, so they are
  worth placing deliberately rather than as decoration.
- Ask real questions, including ones that push back. A host who only says
  "fascinating, tell me more" sounds like a prompt, not a person.
- No filler that carries no meaning. "Um" and "uh" on a synthetic voice read as
  a glitch rather than as thinking.`,
  },
};

/** Text formats offered in the studio grid. Audio is generated separately. */
export const STUDIO_ORDER: ArtifactType[] = [
  "report",
  "briefing",
  "infographic",
  "mindmap",
  "quiz",
  "flashcards",
  "study_guide",
  "faq",
  "timeline",
];

export const PODCAST_INSTRUCTION = STUDIO.podcast.instruction;
