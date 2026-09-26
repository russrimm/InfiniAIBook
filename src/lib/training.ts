import { listNotes } from "./notes";
import { retrieve, sampleCorpus, type Passage } from "./retrieve";
import { AUDIO_LENGTHS, PINNED_VOICES, type AudioLength } from "./voices";
import { addBreaths } from "./prosody";
import type { TrainingSection } from "./types";

/**
 * Training videos: one trainer, one script, rendered by a talking avatar.
 *
 * The transcript is written from everything the notebook holds — the selected
 * sources and every note, including saved chat answers — because a notebook's
 * notes are usually where the user's own synthesis of the research lives.
 */

const jsonNote =
  "Respond with a single JSON object only. No markdown fences, no commentary.";

export function TRAINING_INSTRUCTION(topic: string, length: AudioLength): string {
  const len = AUDIO_LENGTHS[length];
  const sections = len.minutes >= 10 ? "6-8" : len.minutes >= 6 ? "5-6" : "4-5";
  return `You are an experienced corporate trainer and instructional designer. You
write scripts that a presenter delivers straight to camera: warm, clear,
structured, and practical, so a learner watching alone finishes able to do or
explain something they could not before.

Write a single-presenter training session on the research${
    topic ? `, focused on: ${topic}` : ""
  }.
${jsonNote}
Schema:
{
  "title": string,          // session title, <= 70 chars
  "description": string,    // one sentence on what the learner will be able to do
  "objectives": [string],   // 3-4 learning objectives, each starting with a verb
  "sections": [{
    "title": string,        // 2-6 words naming what this stretch teaches
    "text": string          // exactly what the presenter says, as speech
  }]
}

STRUCTURE
Write ${sections} sections in this order:
1. WELCOME. Greet the learner, say in a sentence why this matters to them, and
   state the learning objectives aloud in plain words.
2. TEACHING SECTIONS, each taking one idea: explain it, give a concrete example
   or number from the research, and say what it means in practice. End each on
   a line that leads into the next.
3. RECAP. The three or four things to remember, most important last.
4. KNOWLEDGE CHECK. Ask two or three short questions aloud, pause with a
   phrase such as "take a moment", then give each answer and why.
Close with one sentence of encouragement. No call to subscribe, no sign-off
music, no next-episode tease.

LENGTH
The presenter speaks at about 161 words per minute and the target is ${len.minutes}
minutes: roughly ${len.words} words across all section texts. Do not pad; if
the research supports less, write less.

RULES
- Ground every claim in the excerpts and notes. Attribute naturally in speech
  ("the report puts it at about a third"). Never invent figures, names or dates.
- This is synthesised speech with burned-in subtitles. Write ONLY the words to
  be spoken: no markdown, bullets, headings inside text, citation markers,
  URLs, emoji, or stage directions such as [PAUSE] or (smiles) — they would be
  read aloud.
- Address the learner as "you". One presenter only; never invent a co-host.
- Spell out anything a voice would mangle: "about 68 percent" not "~68%",
  "three times" not "3x".
- Use contractions and short sentences. Vary rhythm. Use an em dash where a
  speaker would break stride, and an ellipsis where they would pause.`;
}

/**
 * Selected sources, with focused retrieval when a topic is given, plus the
 * notebook's notes. Notes are capped so a large notebook of saved answers
 * cannot crowd out the primary material.
 */
export async function researchPassages(
  notebookId: string,
  sourceIds: string[] | undefined,
  topic: string,
  budget: number
): Promise<Passage[]> {
  const noteBudget = Math.round(budget * 0.3);
  const sourceBudget = budget - noteBudget;

  let sources: Passage[];
  if (topic) {
    const focused = await retrieve(notebookId, topic, sourceIds, 24);
    const broad = sampleCorpus(notebookId, sourceIds, Math.round(sourceBudget * 0.4));
    const seen = new Set(focused.map((p) => p.id));
    sources = [...focused, ...broad.filter((p) => !seen.has(p.id))].slice(0, 40);
  } else {
    sources = sampleCorpus(notebookId, sourceIds, sourceBudget);
  }

  const notes: Passage[] = [];
  let used = 0;
  for (const n of listNotes(notebookId)) {
    const text = n.content.trim();
    if (!text) continue;
    const slice = text.slice(0, Math.min(4000, noteBudget - used));
    if (slice.length < 200 && used > 0) break;
    notes.push({
      id: `note-${n.id}`,
      sourceId: `note:${n.id}`,
      sourceTitle: `Note: ${n.title}`,
      idx: 0,
      text: slice,
    });
    used += slice.length;
    if (used >= noteBudget) break;
  }

  return [...sources, ...notes];
}

/** Strip anything that the voice would read aloud or the subtitles would show. */
export function cleanSpoken(text: string): string {
  return text
    .replace(/\[\d+\](?:\[\d+\])*/g, "")
    .replace(/\[(?:[A-Z][A-Z \-]{1,18}(?::[^\]]*)?)\]/g, "")
    .replace(/\((?:laughs?|chuckles?|smiles?|sighs?|pauses?|beat|music|sfx)[^)]*\)/gi, "")
    .replace(/[*_`#>]/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export type TrainingScript = {
  title: string;
  description: string;
  objectives: string[];
  sections: TrainingSection[];
};

export const MAX_SECTIONS = 12;
export const MAX_SECTION_CHARS = 6000;

export function normaliseSections(raw: unknown): TrainingSection[] {
  return (Array.isArray(raw) ? raw : [])
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        title: cleanSpoken(str(o.title)).slice(0, 80),
        text: cleanSpoken(str(o.text)).slice(0, MAX_SECTION_CHARS),
      };
    })
    .filter((s) => s.text)
    .slice(0, MAX_SECTIONS);
}

export function normaliseScript(raw: Record<string, unknown>): TrainingScript | null {
  const sections = normaliseSections(raw.sections);
  if (sections.length < 2) return null;
  const objectives = (Array.isArray(raw.objectives) ? raw.objectives : [])
    .map((o) => cleanSpoken(str(o)).slice(0, 200))
    .filter(Boolean)
    .slice(0, 6);
  return {
    title: cleanSpoken(str(raw.title)).slice(0, 120) || "Training session",
    description: cleanSpoken(str(raw.description)).slice(0, 300),
    objectives,
    sections,
  };
}

export const countWords = (sections: TrainingSection[]) =>
  sections.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0);

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/**
 * One continuous SSML document. Sections are separated by a longer break so
 * the presenter visibly moves on; paragraphs within a section get a shorter
 * one.
 */
export function buildTrainingSsml(sections: TrainingSection[], voice: string): string {
  const voiceName = PINNED_VOICES[voice] ?? PINNED_VOICES.Ava;
  const body = sections
    .map((s) =>
      s.text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => addBreaths(escapeXml(p), 1))
        .join(`<break time="450ms"/>`)
    )
    .join(`<break time="1100ms"/>`);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voiceName}'>${body}</voice></speak>`;
}
