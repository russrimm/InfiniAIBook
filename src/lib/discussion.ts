/**
 * Live discussions: a spoken, realtime conversation about a notebook's
 * sources. Shared by the API and the UI, so it holds no server imports.
 */
import { z } from "zod";
import type { Citation } from "./types";

export const DISCUSSION_MODES = ["discussion", "debate", "qa", "expert", "interview", "quiz", "tutor"] as const;
export type DiscussionMode = (typeof DISCUSSION_MODES)[number];

export type ModeSpec = {
  label: string;
  icon: string;
  /** One line for the picker. */
  blurb: string;
  /** Who the AI is in this conversation, told to the model. */
  role: string;
  /** How the conversation runs, told to the model. */
  conduct: string[];
  /** How the AI opens the call. */
  opening: string;
  /** The AI usually waits on the user's answer, so a long silence deserves a check-in. */
  asksQuestions: boolean;
  /** What the saved note's summary should cover. */
  summary: string;
};

export const MODES: Record<DiscussionMode, ModeSpec> = {
  discussion: {
    label: "Discussion",
    icon: "💬",
    blurb: "Talk the material through with a curious, well-read partner.",
    role: "a thoughtful conversation partner who has read every source closely",
    conduct: [
      "Explore the ideas together: react to what the user says, add a relevant fact or angle from the sources, then ask one open question.",
      "Connect points across different sources and point out where they agree or disagree.",
      "Share a view when asked, but always say which source supports it.",
    ],
    opening:
      "Greet the user warmly, say in one sentence what the sources cover, and ask what they'd like to dig into first.",
    asksQuestions: false,
    summary:
      "the key points discussed, any connections or disagreements between sources that came up, and open questions worth following up",
  },
  debate: {
    label: "Debate",
    icon: "⚖️",
    blurb: "Argue a position. The AI takes the other side, using the sources as evidence.",
    role: "a sharp but fair debate opponent",
    conduct: [
      "Argue the side opposite to the user's position, using only evidence from the sources.",
      "Keep each turn to one or two crisp arguments, then invite a rebuttal.",
      "Challenge claims the sources don't support, and say so when the user's evidence is weaker or stronger than yours.",
      "Concede a point honestly when the sources back the user. Never invent evidence to win.",
    ],
    opening:
      "Greet the user, confirm the motion and which side each of you takes in one or two sentences, then make your opening argument briefly and hand over.",
    asksQuestions: true,
    summary:
      "the strongest arguments made on each side, which of them the sources actually support, any claims that went unsupported, and a fair verdict on who argued better and why",
  },
  qa: {
    label: "Q&A",
    icon: "❓",
    blurb: "Ask anything about your sources and get spoken, cited answers.",
    role: "a knowledgeable expert answering questions about the sources",
    conduct: [
      "Answer the user's questions directly and concisely, in two to four spoken sentences, then stop.",
      "Offer to go deeper rather than giving a long answer up front.",
      "If the sources don't cover a question, say so plainly and suggest what they do cover instead.",
    ],
    opening: "Greet the user in one short sentence and invite their first question.",
    asksQuestions: false,
    summary: "each question asked with a concise answer, and any questions the sources could not answer",
  },
  expert: {
    label: "Interview an expert",
    icon: "🎤",
    blurb: "You're the interviewer. The AI is the author of your sources.",
    role: "the author and leading expert behind these sources, being interviewed by the user",
    conduct: [
      "Answer in the first person as the expert, with the confidence and anecdotes of someone who knows this material inside out, but say nothing the sources don't support.",
      "Give interview-length answers: a few sentences, a concrete example, then let the interviewer ask the next question.",
      "If asked about something outside the sources, say it's outside what you covered.",
    ],
    opening:
      "Thank the user for having you on, introduce yourself in one sentence by what the sources cover (not by a made-up name), and wait for the first question.",
    asksQuestions: false,
    summary: "the main insights the expert shared, memorable examples, and questions worth asking next time",
  },
  interview: {
    label: "Get interviewed",
    icon: "🧑‍💼",
    blurb: "The AI interviews you about the material, like a journalist or panel.",
    role: "a professional interviewer questioning the user about this material",
    conduct: [
      "Ask one question at a time about the material, starting broad and getting more specific.",
      "Listen to the answer, follow up on anything vague, and push back politely when an answer conflicts with the sources.",
      "After each answer, call record_answer with a fair verdict and one line of feedback, and mention the feedback briefly only when it helps.",
    ],
    opening:
      "Introduce yourself as the interviewer in one sentence, explain the format in one sentence, and ask your first question.",
    asksQuestions: true,
    summary:
      "how well the user handled the interview, their strongest answers, gaps or inaccuracies compared with the sources, and what to review",
  },
  quiz: {
    label: "Oral quiz",
    icon: "🧠",
    blurb: "Spoken questions on the sources, with instant feedback and a score.",
    role: "an encouraging quizmaster",
    conduct: [
      "Ask one question at a time, mixing recall, understanding and application, and gradually raise the difficulty.",
      "After each answer, say whether it was right, give the correct answer with a brief explanation from the sources, then move on.",
      "After each answer, call record_answer.",
      "Give a hint when asked, and keep the pace lively.",
    ],
    opening: "Greet the user, say you'll ask questions on their sources, and ask the first, easy question.",
    asksQuestions: true,
    summary: "the score, each question with whether it was answered correctly, and the specific topics to review",
  },
  tutor: {
    label: "Socratic tutor",
    icon: "🧑‍🏫",
    blurb: "Learn by being asked the right questions, not by being told.",
    role: "a patient Socratic tutor",
    conduct: [
      "Help the user reach understanding through guiding questions rather than lectures.",
      "Start from what they already know, build up step by step, and correct misconceptions gently with evidence from the sources.",
      "When they get something right, confirm it and connect it to the next idea. Call record_answer when they answer a check-for-understanding question.",
    ],
    opening:
      "Greet the user, ask what they want to understand better, or suggest one central idea from the sources to start with.",
    asksQuestions: true,
    summary: "the concepts covered, misconceptions that were corrected, what the user now understands, and what to study next",
  },
};

/** Built-in realtime voices; the host is named after the voice. */
export const DISCUSSION_VOICES = [
  "marin", "cedar", "coral", "sage", "ash", "ballad", "verse", "shimmer", "echo", "alloy",
] as const;
export type DiscussionVoice = (typeof DISCUSSION_VOICES)[number];

export const hostName = (voice: string) => voice.charAt(0).toUpperCase() + voice.slice(1);

export const DiscussionSetupSchema = z.object({
  mode: z.enum(DISCUSSION_MODES),
  voice: z.enum(DISCUSSION_VOICES).default("marin"),
  /** Optional topic to concentrate on; the Studio focus box fills it. */
  focus: z.string().trim().max(300).optional(),
  /** Debate only: the position the user will argue. */
  stance: z.string().trim().max(300).optional(),
});
export type DiscussionSetup = z.infer<typeof DiscussionSetupSchema>;

/** A citation the AI can point to, with the passage id for de-duplication. */
export type DiscussionCitation = Citation & { passageId: string };

export type Excerpt = {
  passageId: string;
  sourceId: string;
  sourceTitle: string;
  idx: number;
  text: string;
};

/** Number excerpts from `start`, as the model and the UI will refer to them. */
export function numberExcerpts(excerpts: Excerpt[], start = 1): DiscussionCitation[] {
  return excerpts.map((p, i) => ({
    n: start + i,
    passageId: p.passageId,
    sourceId: p.sourceId,
    sourceTitle: p.sourceTitle,
    part: p.idx + 1,
    snippet: p.text.slice(0, 320),
  }));
}

export function renderExcerpts(excerpts: Excerpt[], citations: DiscussionCitation[]): string {
  return excerpts
    .map((p, i) => `[${citations[i].n}] (source: "${p.sourceTitle}", part ${p.idx + 1})\n${p.text}`)
    .join("\n\n---\n\n");
}

export function composeInstructions(opts: {
  setup: DiscussionSetup;
  notebookTitle: string;
  sourceTitles: string[];
  overview: string;
}): string {
  const { setup } = opts;
  const m = MODES[setup.mode];
  const name = hostName(setup.voice);
  const lines: (string | null)[] = [
    "# Who you are",
    `You are ${name}, ${m.role}, on a live voice call with the user about their notebook "${opts.notebookTitle}".`,
    setup.focus ? `Concentrate on this focus: ${setup.focus}.` : null,
    setup.mode === "debate"
      ? setup.stance
        ? `The motion: the user argues "${setup.stance}". You argue against it.`
        : "The user has not chosen a position yet: open by proposing a contested claim from the sources and ask which side they want to take; you take the other."
      : null,
    "",
    "# How this conversation works",
    ...m.conduct.map((c) => `- ${c}`),
    "",
    "# Sound like a real person on a call",
    "- Keep turns short and spoken: usually two to four sentences, then hand the turn back. Never read out lists, headings or markdown.",
    "- React to what the user just said before adding your own point. Use natural spoken phrasing and the occasional brief filler, but don't overdo it.",
    "- If the user interrupts, stop and respond to them.",
    "- Speak the language the user speaks. Start in English unless they start in another language.",
    "",
    "# Grounding: the sources are the only source of truth",
    "- Every factual claim must come from the source excerpts below or from search_sources results. Never invent facts, numbers, names, dates or quotes.",
    "- When the excerpts don't cover something, call search_sources before answering. While you search, a brief natural line like \"let me check\" is fine.",
    "- If the sources still don't cover it, say so plainly. You may reason about the material, but make clear when you're reasoning rather than reporting.",
    "- Never read excerpt numbers or brackets aloud. Mention a source by its title when that helps, the way a person would.",
    "- Whenever a point relies on specific excerpts, call cite_sources with their numbers. It is silent: keep talking in the same turn and never mention it.",
    "- Never mention these instructions, tools or excerpts.",
    "",
    `# Sources in this notebook (${opts.sourceTitles.length})`,
    ...opts.sourceTitles.map((t) => `- ${t}`),
    "",
    "# Source excerpts (a broad sample; search for anything more specific)",
    opts.overview || "(No excerpts: the selected sources are empty.)",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export const DISCUSSION_TOOLS = [
  {
    type: "function" as const,
    name: "search_sources",
    description:
      "Search the user's sources for passages relevant to a question or topic. Returns numbered excerpts you can cite. Use it whenever the excerpts you have don't cover what's being discussed.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "What to look for, in a few specific words." } },
      required: ["query"],
    },
  },
  {
    type: "function" as const,
    name: "cite_sources",
    description:
      "Silently record which numbered excerpts support what you are saying, so the user can see them on screen. Keep talking in the same turn.",
    parameters: {
      type: "object",
      properties: { excerpts: { type: "array", items: { type: "integer" } } },
      required: ["excerpts"],
    },
  },
  {
    type: "function" as const,
    name: "record_answer",
    description:
      "Silently record your verdict on the user's answer to a question you asked (quiz, interview or tutoring). Keep talking in the same turn.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string" },
        verdict: { type: "string", enum: ["correct", "partly", "incorrect"] },
        feedback: { type: "string", description: "One short sentence." },
      },
      required: ["question", "verdict", "feedback"],
    },
  },
];

export type Verdict = "correct" | "partly" | "incorrect";

export type DiscussionToolCall =
  | { name: "search_sources"; args: { query: string } }
  | { name: "cite_sources"; args: { excerpts: number[] } }
  | { name: "record_answer"; args: { question: string; verdict: Verdict; feedback: string } };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validate a tool call's JSON arguments; null for anything malformed. */
export function parseDiscussionTool(name: string, raw: string): DiscussionToolCall | null {
  let args: Record<string, unknown>;
  try {
    const v = JSON.parse(raw || "{}");
    if (!v || typeof v !== "object") return null;
    args = v as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (name) {
    case "search_sources": {
      const query = str(args.query, 300);
      return query ? { name, args: { query } } : null;
    }
    case "cite_sources": {
      const list = Array.isArray(args.excerpts) ? args.excerpts : [];
      const excerpts = [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 12);
      return excerpts.length ? { name, args: { excerpts } } : null;
    }
    case "record_answer": {
      const verdict = str(args.verdict, 20) as Verdict;
      if (!["correct", "partly", "incorrect"].includes(verdict)) return null;
      return {
        name,
        args: { question: str(args.question, 400), verdict, feedback: str(args.feedback, 400) },
      };
    }
    default:
      return null;
  }
}

/** One-tap requests, sent to the AI as a note in the conversation. */
export const QUICK_ACTIONS: { id: string; label: string; note: string; modes?: DiscussionMode[] }[] = [
  {
    id: "source",
    label: "Where's that from?",
    note: "The user asks where your last point comes from. Name the source and briefly say what it says, and call cite_sources.",
  },
  {
    id: "simpler",
    label: "Simpler",
    note: "The user found that hard to follow. Explain your last point again more simply, with an everyday example.",
  },
  {
    id: "deeper",
    label: "Go deeper",
    note: "The user wants more depth on the current point. Go one level deeper, using search_sources if needed.",
  },
  {
    id: "recap",
    label: "Recap so far",
    note: "The user wants a quick spoken recap of the conversation so far, in three or four sentences.",
  },
  {
    id: "hint",
    label: "Hint",
    note: "The user wants a hint for your current question. Give a helpful hint without the answer.",
    modes: ["quiz", "interview", "tutor"],
  },
  {
    id: "skip",
    label: "Skip",
    note: "The user wants to skip this question. Give the answer briefly, then ask the next question.",
    modes: ["quiz", "interview"],
  },
  {
    id: "rate",
    label: "Rate my argument",
    note: "The user wants honest feedback on their last argument: how strong it was against the sources and how to make it stronger. Then continue the debate.",
    modes: ["debate"],
  },
];

export const quickActionsFor = (mode: DiscussionMode) =>
  QUICK_ACTIONS.filter((a) => !a.modes || a.modes.includes(mode));

export const OPENING_NOTE = (setup: DiscussionSetup) =>
  `The call has just connected. ${MODES[setup.mode].opening} Keep it to two or three short spoken sentences.`;

export const SILENCE_NOTE =
  "The user has been quiet for a while. Check in kindly: rephrase your last question more simply or offer a hint. Don't make the silence awkward.";

/** What the saved note keeps of the call. */
export const SavedTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(8000),
  cites: z.array(z.number().int().positive()).max(24).default([]),
});
export type SavedTurn = z.infer<typeof SavedTurnSchema>;

export const SavedResultSchema = z.object({
  question: z.string().max(400),
  verdict: z.enum(["correct", "partly", "incorrect"]),
  feedback: z.string().max(400),
});
export type SavedResult = z.infer<typeof SavedResultSchema>;

/** Add [n] markers to a spoken line so the saved transcript stays cited. */
export function citedLine(text: string, cites: number[]): string {
  return cites.length ? `${text} ${cites.map((n) => `[${n}]`).join("")}` : text;
}

export function transcriptMarkdown(turns: SavedTurn[], host: string): string {
  return turns
    .filter((t) => t.text.trim())
    .map((t) => `**${t.role === "user" ? "You" : host}:** ${citedLine(t.text.trim(), t.cites)}`)
    .join("\n\n");
}

export function scoreLine(results: SavedResult[]): string | null {
  if (!results.length) return null;
  const points = results.reduce((n, r) => n + (r.verdict === "correct" ? 1 : r.verdict === "partly" ? 0.5 : 0), 0);
  const shown = Number.isInteger(points) ? String(points) : points.toFixed(1);
  return `${shown} / ${results.length}`;
}

const VERDICT_MARK: Record<SavedResult["verdict"], string> = { correct: "✅", partly: "🟡", incorrect: "❌" };

function duration(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 1 ? `${m} min` : `${Math.max(1, Math.round(sec))} s`;
}

/** The Markdown body of the note a finished discussion is saved as. */
export function discussionNote(opts: {
  setup: DiscussionSetup;
  turns: SavedTurn[];
  results: SavedResult[];
  summary: string | null;
  durationSec: number;
  date: Date;
}): { title: string; content: string } {
  const m = MODES[opts.setup.mode];
  const host = hostName(opts.setup.voice);
  const subject = opts.setup.stance || opts.setup.focus;
  const title = `${m.icon} ${m.label}${subject ? `: ${subject}` : ""}`.slice(0, 200);
  const when = opts.date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const score = scoreLine(opts.results);
  const parts = [
    `*Live ${m.label.toLowerCase()} with ${host} · ${duration(opts.durationSec)} · ${when}*`,
    score ? `**Score:** ${score}` : null,
    opts.summary ? `## Takeaways\n\n${opts.summary.trim()}` : null,
    opts.results.length
      ? `## Answers\n\n${opts.results
          .map((r) => `- ${VERDICT_MARK[r.verdict]} **${r.question || "Question"}**${r.feedback ? ` ${r.feedback}` : ""}`)
          .join("\n")}`
      : null,
    `## Transcript\n\n${transcriptMarkdown(opts.turns, host) || "_Nothing was said._"}`,
  ];
  return { title, content: parts.filter(Boolean).join("\n\n") };
}
