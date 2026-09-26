import type { ArtifactType, StudyDifficulty, StudyLength, StudyOptions } from "./types";
import { AUDIO_LENGTHS, SPEAKER_IDS, audioLength, type SpeakerId } from "./voices";

export const GROUNDING_RULES = `
You are InfiniAIBook, a research assistant that answers ONLY from the provided source excerpts.
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

type PodcastSpeakerPrompt = {
  id: SpeakerId;
  name?: string;
  role?: string;
};

const fallbackPodcastSpeakers = (): PodcastSpeakerPrompt[] => [
  {
    id: "a",
    role: "drives the conversation and asks the questions",
  },
  {
    id: "b",
    role: "is the analyst who explains and supplies detail",
  },
];

function podcastSpeakers(opts?: StudyOptions): PodcastSpeakerPrompt[] {
  const raw = (opts as (StudyOptions & { podcastSpeakers?: PodcastSpeakerPrompt[] }) | undefined)
    ?.podcastSpeakers;
  if (!Array.isArray(raw) || !raw.length) return fallbackPodcastSpeakers();

  const speakers: PodcastSpeakerPrompt[] = raw
    .slice(0, 4)
    .map((s, i) => ({
      id: SPEAKER_IDS.includes(s.id) ? s.id : SPEAKER_IDS[i],
      name: s.name?.trim(),
      role: s.role?.trim(),
    }));
  return speakers.length ? speakers : fallbackPodcastSpeakers();
}

function podcastSpeakerGuide(speakers: PodcastSpeakerPrompt[]): string {
  return speakers
    .map((s) => {
      const label = s.name ? `${s.id} (${s.name})` : s.id;
      return `- "${label}": ${s.role || "a distinct speaker with a clear point of view"}`;
    })
    .join("\n");
}

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
                               "metaphor": string, "value": string }] }],
  "hub": { "label": string, "caption": string },
  "scale": [{ "tier": string, "example": string, "figure": string }],
  "matrix": { "columns": [string],
              "rows": [{ "feature": string, "values": [string] }] }
}
Rules: 3-4 stats whose "value" is a short figure taken literally from the sources
(e.g. "68%", "$2.4B", "3x", "12 weeks"); never fabricate a number — if the sources have
few numbers, use counts of things the sources enumerate. 3-4 sections, each with 2-4 short
bullets (<= 14 words each) and a single emoji as "icon". "takeaway" is one memorable sentence.
Include citation markers inside bullets and stat captions.
Omit "pullQuote", "nextSteps", "flow", "chart", "compare", "checklist", "regions",
"hub", "scale" and "matrix" unless the style guidance below asks for them.`,
  },

  video: {
    label: "Whiteboard video",
    blurb: "Narrated hand-drawn explainer",
    icon: "🎬",
    json: true,
    // Planned by src/lib/whiteboard.ts and built by /api/video, not here. This
    // entry exists so the artifact list has a label and an icon for it.
    instruction: () => "",
  },

  training: {
    label: "Training video",
    blurb: "Presenter-led training session",
    icon: "🧑‍🏫",
    json: true,
    // Written by src/lib/training.ts via /api/training and rendered by the
    // Azure Speech avatar, not here. Present so listings have a label and icon.
    instruction: () => "",
  },

  podcast: {
    label: "Audio overview",
    blurb: "Custom speaker audio",
    icon: "🎧",
    json: true,
    instruction: (topic, opts) => {
      const len = AUDIO_LENGTHS[audioLength(opts?.audioLength)];
      const segs = len.minutes >= 10 ? "5-7" : len.minutes >= 6 ? "4-6" : "3-4";
      const speakers = podcastSpeakers(opts);
      const speakerIds = speakers.map((s) => `"${s.id}"`).join(" | ");
      const isSolo = speakers.length === 1;
      const lead = speakers[0];
      const format = isSolo
        ? "solo narrated monologue/explainer"
        : `${speakers.length}-speaker audio overview`;
      return `You are a professional podcast scriptwriter with ten years of experience in
audio content creation. You write conversational scripts that sound natural
spoken aloud, and you know how to place hooks, transitions and pacing so a
listener stays with you. Everything you write is audio-first: the listener
cannot see anything.

Write a ${format} of the sources${topic ? `, focused on: ${topic}` : ""}.
${jsonNote}
Schema:
{
  "title": string,        // episode title, <= 70 chars; do not use the words "podcast" or "episode"
  "description": string,  // one sentence on what a listener will learn
  "segments": [{
    "title": string,      // 2-5 words naming what this stretch is about
    "turns": [{ "speaker": ${speakerIds}, "text": string }]
  }]
}
Every turn must be tagged with one of the configured speaker ids. Do not write
speaker names into the spoken text unless a human would naturally say them.

CONFIGURED SPEAKERS
${podcastSpeakerGuide(speakers)}
${isSolo
  ? `This is a solo narration. Use only "${lead.id}" and make it feel like a clear,
curious explainer rather than a host interviewing themselves.`
  : `Keep each speaker in character. Let their role or personality affect the
questions they ask, the examples they choose, and what they challenge.`}

STRUCTURE
Write ${segs} segments in this order:
1. A COLD OPEN. Lead with the single most arresting thing in the sources — a
   number, a reversal, a consequence — and say why it matters. No throat
   clearing, no "welcome to the show", no naming the format.
2. THREE OR MORE MAIN SEGMENTS, each taking one distinct aspect of the material.
   Each must end on a line that hands off to the next, so the seam is invisible.
3. A CLOSE that recaps the two or three things worth remembering and ends on the
   most important one. No sign-off, no call to action, no next-episode tease.

Segment titles are shown to the listener as chapters they can jump to, so name
the content ("What the cost actually covers"), never the position ("Segment 2").

LENGTH
This is spoken at about 161 words per minute, and the target is ${len.minutes} minutes.
Write roughly ${len.words} words in total across ${len.turns[0]}-${len.turns[1]} turns,
distributed across the segments. The word count is the target that matters — it
is what sets the running time. Count as you go and keep going until you reach
it${
        len.minutes >= 10
          ? ". At this length, cover the material properly: take separate parts of it in turn, follow the implications, and let the speakers work through disagreements rather than summarising faster"
          : ""
      }.
Do not pad to reach the number. If the sources genuinely do not support this
much, write what they do support rather than repeating yourself.

Rules:
- Use only the configured speaker ids (${speakerIds}). ${
        isSolo
          ? `Every turn's "speaker" must be "${lead.id}". Break the narration into
  natural chunks instead of one wall of text.`
          : "Distribute turns naturally across the configured speakers; do not invent extra speakers."
      }
- This is synthesised speech, not a recording session. Write ONLY the words to
  be said: no markdown, headings, bullets, citation markers, URLs, emoji, or
  bracketed cues of any kind. A stage direction such as [MUSIC], [PAUSE] or
  (laughs) will be read aloud word for word.
- There is no music, no sponsor, no advertisement and no audience to address.
  Do not invent guests or speakers beyond the configured set.
- Spell out anything a text-to-speech voice would mangle: "about 68 percent" not
  "~68%", "carbon dioxide" not "CO2", "three times" not "3x".
- Ground every claim in the excerpts, attributing naturally in speech, e.g.
  "the paper puts it at about a third". If the sources disagree, say so.
- Give the listener something to hold onto every couple of minutes: a concrete
  example, a number, a comparison, or a question that reframes what came before.

WRITE IT AS SPEECH, NOT PROSE READ ALOUD
The difference between an audio overview that sounds human and one that sounds
like a document being narrated is almost entirely in the writing.

- Vary turn length hard. A two-word reaction ("Really?", "That's the part I'd
  push back on") next to a five-sentence explanation is what a conversation
  sounds like. Uniform paragraphs are what a report sounds like.
- Use contractions throughout. "It's", "they'd", "that isn't" — never the
  expanded forms unless the word is being stressed.
- Let speakers interrupt the shape of their own sentences. Start a thought,
  qualify it, then land it: "It's cheaper — well, cheaper per unit — but the
  setup cost is brutal."
- Open some turns the way people actually open them: "Right, so", "OK but",
  "See, that's", "Here's the thing", "I mean". Not every turn. Roughly one in
  three.
- ${
        isSolo
          ? "Let the narrator occasionally reframe or challenge their own point before moving on."
          : `Let "${lead.id}" react before asking the next thing, rather than moving straight on.`
      }
- Use em dashes for the places a speaker would break stride, and an ellipsis
  where they would trail off. These are rendered as real pauses, so they are
  worth placing deliberately rather than as decoration.
- ${
        isSolo
          ? "Use rhetorical questions sparingly and answer them from the sources."
          : `Ask real questions, including ones that push back. A speaker who only says
  "fascinating, tell me more" sounds like a prompt, not a person.`
      }
- No filler that carries no meaning. "Um" and "uh" on a synthetic voice read as
  a glitch rather than as thinking.
- A reaction may be written out as a sound where a person would actually make
  one: "Ha!" at something absurd, "Heh." at something wry, "Hmm." while
  weighing an objection, "Oh!" at a genuine surprise, "Phew." at a large number.
  Use at most two or three in the entire conversation, always at the start of a
  turn and followed by the substance of the reaction, as in "Ha! That can't be
  right — how did they land on that?". These are spoken as written, so a string
  of them reads as a tic rather than as warmth. Never write one as a stage
  direction: "(laughs)" is read out as the word.`;
    },
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
