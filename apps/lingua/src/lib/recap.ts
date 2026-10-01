/**
 * End-of-session recap: what went well, what to fix, words to keep. Built by
 * the chat model from the transcript and the partner's live notes, or — when
 * no chat model is configured — assembled directly from those notes.
 */
import type { ResolvedSetup } from "./setup";
import type { Recap, Transcript } from "./types";
import { detectLanguage } from "./languages";
import { shortName } from "./personas";

const MAX_TRANSCRIPT_CHARS = 24_000;

function transcriptText(s: ResolvedSetup, t: Transcript): string {
  const partner = shortName(s.persona);
  const lines = t.turns.map((turn) => `${turn.role === "learner" ? "Learner" : partner}: ${turn.text}`);
  let text = lines.join("\n");
  // Keep the end of long calls: the recap matters most for the latest part.
  if (text.length > MAX_TRANSCRIPT_CHARS) text = "…\n" + text.slice(-MAX_TRANSCRIPT_CHARS);
  return text;
}

export function buildRecapMessages(s: ResolvedSetup, t: Transcript) {
  const notes = {
    corrections: t.corrections.map((c) => ({ said: c.learnerSaid, better: c.corrected, why: c.explanation })),
    vocabulary: t.vocabulary,
    goals: s.scenario.goals.map((g) => ({ ...g, done: t.goalsDone.includes(g.id) })),
  };
  const system = [
    `You are an encouraging, precise ${s.target.name} language coach writing a short recap of a practice conversation.`,
    `The learner speaks ${s.support.name} and practices ${s.target.name} at about CEFR ${s.level.id}.`,
    `Write every explanation, summary and next step in ${s.support.name}. Keep quoted learner phrases and corrections in ${s.target.name}.`,
    "Return only a JSON object with these keys:",
    '{ "summary": string (2–3 warm, specific sentences),',
    '  "strengths": string[] (1–4 specific things they did well),',
    '  "mistakes": [{ "said": string, "better": string, "why": string }] (the most useful 0–6; merge duplicates; skip trivial ones),',
    '  "vocabulary": [{ "term": string, "meaning": string, "example"?: string }] (up to 12 words or phrases worth keeping),',
    '  "nextSteps": string[] (1–3 concrete suggestions),',
    '  "suggestedScenario"?: string (one of: cafe, airport, hotel, directions, doctor, market, interview, phone, dinner, free),',
    '  "estimatedLevel"?: "A1"|"A2"|"B1"|"B2"|"C1"|"C2" (from this conversation only),',
    '  "targetLanguageShare"?: number (0–100, share of the learner\'s words in the target language) }',
    "Base everything on the transcript; do not invent mistakes the learner did not make.",
  ].join("\n");
  const user = [
    `Situation: ${s.scenario.title}.`,
    `Partner's live notes (may be incomplete): ${JSON.stringify(notes)}`,
    "Transcript:",
    transcriptText(s, t) || "(the learner did not speak)",
  ].join("\n\n");
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

/** Share of learner words detected as target language, 0–100, or undefined if no speech. */
export function targetShare(s: ResolvedSetup, t: Transcript): number | undefined {
  let target = 0;
  let total = 0;
  for (const turn of t.turns) {
    if (turn.role !== "learner" || !turn.text.trim()) continue;
    const words = turn.text.trim().split(/\s+/).length;
    const lang = turn.lang ?? detectLanguage(turn.text, [s.target.code, s.support.code]);
    total += words;
    if (lang === s.target.code) target += words;
  }
  return total ? Math.round((target / total) * 100) : undefined;
}

/** A recap from the partner's notes alone, for when no chat model is configured. */
export function fallbackRecap(s: ResolvedSetup, t: Transcript): Recap {
  const done = s.scenario.goals.filter((g) => t.goalsDone.includes(g.id));
  const learnerTurns = t.turns.filter((x) => x.role === "learner").length;
  const seen = new Set<string>();
  const mistakes = t.corrections
    .filter((c) => {
      const key = `${c.learnerSaid}→${c.corrected}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map((c) => ({ said: c.learnerSaid, better: c.corrected, why: c.explanation }));
  return {
    summary: `You spoke ${learnerTurns} time${learnerTurns === 1 ? "" : "s"} with ${shortName(s.persona)} in "${s.scenario.title}"${
      done.length ? `, and reached ${done.length} of ${s.scenario.goals.length} goals` : ""
    }.`,
    strengths: done.map((g) => g.label),
    mistakes,
    vocabulary: t.vocabulary.slice(0, 12).map((v) => ({ term: v.term, meaning: v.translation, example: v.example })),
    nextSteps: mistakes.length
      ? ["Say each corrected sentence out loud three times.", "Try the same situation again and use the new words."]
      : ["Try a harder situation or the next level up."],
    targetLanguageShare: targetShare(s, t),
  };
}
