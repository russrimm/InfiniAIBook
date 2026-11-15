import { chatText } from "./ai";
import { STOPPED_MARK } from "./chatmarkdown";
import type { Citation } from "./types";

export const MAX_SUGGESTIONS = 3;
const MAX_QUESTION_CHARS = 120;
const MIN_QUESTION_CHARS = 8;
/** What the model is shown of the answer and each excerpt; the call stays a few hundred tokens. */
const ANSWER_CHARS = 1_500;
const EXCERPT_CHARS = 350;
const EXCERPTS = 4;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Turn the model's reply into at most three clean questions. Accepts the JSON
 * it was asked for, a bare array, or a plain list of lines; anything that is
 * not a short question, repeats another, or repeats the question just asked is
 * dropped.
 */
export function parseSuggestions(raw: string, asked = ""): string[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let items: unknown[] = [];
  const json = text.match(/[[{][\s\S]*[\]}]/)?.[0];
  try {
    const parsed: unknown = JSON.parse(json ?? text);
    const list = Array.isArray(parsed) ? parsed : (parsed as { suggestions?: unknown })?.suggestions;
    if (Array.isArray(list)) items = list;
  } catch {
    items = text.split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""));
  }
  const seen = new Set([norm(asked)]);
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const q = item
      .replace(/\[\d+\]/g, "")
      .replace(/\s+([?.!,])/g, "$1")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = norm(q);
    if (q.length < MIN_QUESTION_CHARS || q.length > MAX_QUESTION_CHARS || !q.endsWith("?")) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

const SYSTEM = `You suggest follow-up questions for a research chat that answers only from the user's sources.
Write exactly ${MAX_SUGGESTIONS} short questions (under 90 characters each) the user could ask next.
Each must be answerable from the source excerpts shown, must not repeat the question already asked, and must not need outside knowledge.
Reply with JSON only: {"suggestions":["...","...","..."]}`;

/** The prompt for one answer: its question, a shortened answer, and the passages it cited. */
export function suggestionPrompt(question: string, answer: string, citations: Citation[]) {
  const excerpts = citations
    .slice(0, EXCERPTS)
    .map((c) => `[${c.n}] ${c.sourceTitle}: ${(c.content ?? c.snippet).replace(/\s+/g, " ").slice(0, EXCERPT_CHARS)}`)
    .join("\n");
  return [
    { role: "system" as const, content: SYSTEM },
    {
      role: "user" as const,
      content: `Question asked: ${question.slice(0, 500)}\n\nAnswer given (shortened): ${answer.slice(0, ANSWER_CHARS)}\n\nSource excerpts:\n${excerpts}`,
    },
  ];
}

/** Answers already asked about, so a repeat request costs nothing. Small and process-local on purpose. */
const cache = new Map<string, string[]>();
const CACHE_MAX = 100;

/**
 * Follow-up questions for an answer. An answer that cites nothing, or was cut
 * short, has no grounded follow-ups, so it gets none and no model call.
 */
export async function suggestFollowUps(turn: {
  answerId: string;
  question: string;
  answer: string;
  citations: Citation[];
}): Promise<string[]> {
  if (!turn.citations.length || turn.answer.endsWith(STOPPED_MARK.trimEnd())) return [];
  const hit = cache.get(turn.answerId);
  if (hit) return hit;
  const raw = await chatText(suggestionPrompt(turn.question, turn.answer, turn.citations), 0.4);
  const suggestions = parseSuggestions(raw, turn.question);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(turn.answerId, suggestions);
  return suggestions;
}
