/**
 * Live conversation state, folded from realtime server events.
 *
 * Pure: the browser hook feeds events in, tests feed recorded ones. Turns are
 * keyed by the realtime item id so a learner line whose transcription arrives
 * after the partner has already answered still lands in the right place.
 */
import { detectLanguage, isLanguage, language } from "./languages";
import { parseToolCall, type LanguageMode, type ToolCall } from "./tools";
import type { Correction, Transcript, Turn, Vocab } from "./types";

export type LiveTurn = Turn & { id: string; pending: boolean };

/** A note shown in the transcript after the turn it follows (null: before the first). */
export type Notice = { id: string; afterTurnId: string | null; text: string; kind: "switch" | "scaffold" | "info" };

/** A correction tied to the learner turn it refers to by id, which survives turns being dropped. */
export type LiveCorrection = Omit<Correction, "turnIndex"> & { turnId: string | null };

export type ConversationState = {
  /** [target, support] language codes, for tagging lines. */
  langs: [string, string];
  turns: LiveTurn[];
  corrections: LiveCorrection[];
  vocabulary: Vocab[];
  goalsDone: string[];
  notices: Notice[];
  languageMode: LanguageMode;
  partnerSpeaking: boolean;
  learnerSpeaking: boolean;
  responseActive: boolean;
  /** The learner turn the current response is answering, fixed when the response starts. */
  anchorTurnId: string | null;
  connectedAt: number | null;
  seenCalls: string[];
};

export function initialConversation(target: string, support: string): ConversationState {
  return {
    langs: [target, support],
    turns: [],
    corrections: [],
    vocabulary: [],
    goalsDone: [],
    notices: [],
    languageMode: "target",
    partnerSpeaking: false,
    learnerSpeaking: false,
    responseActive: false,
    anchorTurnId: null,
    connectedAt: null,
    seenCalls: [],
  };
}

// Realtime events are loosely typed JSON; only the fields read here are declared.
export type ServerEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  item?: { id?: string; type?: string; role?: string };
  response?: {
    status?: string;
    output?: { type?: string; id?: string; call_id?: string; name?: string; arguments?: string; role?: string }[];
  };
  error?: { code?: string; message?: string };
};

export type Action =
  | { type: "connected"; now: number }
  | { type: "server"; event: ServerEvent; now: number }
  | { type: "tools"; calls: { callId: string; call: ToolCall }[] }
  | { type: "gloss"; id: string; gloss: string }
  | { type: "notice"; text: string; kind: Notice["kind"] };

const elapsed = (s: ConversationState, now: number) => (s.connectedAt ? Math.max(0, now - s.connectedAt) : 0);

function ensureTurn(
  s: ConversationState,
  id: string | undefined,
  role: Turn["role"],
  now: number
): ConversationState {
  if (!id || s.turns.some((t) => t.id === id)) return s;
  return {
    ...s,
    turns: [...s.turns, { id, role, text: "", lang: null, at: elapsed(s, now), pending: true }],
  };
}

function patchTurn(s: ConversationState, id: string | undefined, patch: (t: LiveTurn) => LiveTurn): ConversationState {
  if (!id) return s;
  return { ...s, turns: s.turns.map((t) => (t.id === id ? patch(t) : t)) };
}

function finishText(s: ConversationState, id: string | undefined, text: string): ConversationState {
  const clean = text.trim();
  if (!clean) return dropTurn(s, id);
  return patchTurn(s, id, (t) => ({ ...t, text: clean, pending: false, lang: detectLanguage(clean, s.langs) }));
}

/**
 * Remove a turn that turned out empty (noise, a cough, a failed transcription).
 * Anything pointing at it moves to the turn before it, so a correction or
 * notice never ends up attached to some other speaker's line.
 */
function dropTurn(s: ConversationState, id: string | undefined): ConversationState {
  const i = s.turns.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const removed = s.turns[i];
  const prevId = i > 0 ? s.turns[i - 1].id : null;
  const prevLearnerId =
    [...s.turns.slice(0, i)].reverse().find((t) => t.role === "learner")?.id ?? null;
  return {
    ...s,
    turns: s.turns.filter((t) => t.id !== removed.id),
    corrections: s.corrections.map((c) => (c.turnId === removed.id ? { ...c, turnId: prevLearnerId } : c)),
    notices: s.notices.map((n) => (n.afterTurnId === removed.id ? { ...n, afterTurnId: prevId } : n)),
    anchorTurnId: s.anchorTurnId === removed.id ? prevLearnerId : s.anchorTurnId,
  };
}

function lastLearnerId(s: ConversationState): string | null {
  return [...s.turns].reverse().find((t) => t.role === "learner")?.id ?? null;
}

const lastTurnId = (s: ConversationState) => s.turns.at(-1)?.id ?? null;

function modeLabel(s: ConversationState, mode: LanguageMode): string {
  const [target, support] = s.langs.map((c) => (isLanguage(c) ? language(c).name : c));
  if (mode === "mixed") return `Mixing ${target} and ${support}`;
  return `Switched to ${mode === "target" ? target : support}`;
}

function applyTool(s: ConversationState, callId: string, call: ToolCall): ConversationState {
  if (s.seenCalls.includes(callId)) return s;
  const next = { ...s, seenCalls: [...s.seenCalls, callId] };
  switch (call.name) {
    case "set_language_mode": {
      if (call.args.mode === s.languageMode) return next;
      return {
        ...next,
        languageMode: call.args.mode,
        notices: [
          ...next.notices,
          {
            id: callId,
            afterTurnId: lastTurnId(next),
            kind: "switch",
            text: `${modeLabel(next, call.args.mode)}${call.args.reason ? ` · ${call.args.reason}` : ""}`,
          },
        ],
      };
    }
    case "log_correction":
      return {
        ...next,
        corrections: [
          ...next.corrections,
          {
            turnId: next.anchorTurnId ?? lastLearnerId(next),
            learnerSaid: call.args.learner_said,
            corrected: call.args.corrected,
            explanation: call.args.explanation,
            category: call.args.category,
          },
        ],
      };
    case "log_vocabulary": {
      const term = call.args.term.toLowerCase();
      if (next.vocabulary.some((v) => v.term.toLowerCase() === term)) return next;
      return { ...next, vocabulary: [...next.vocabulary, call.args] };
    }
    case "scenario_progress":
      if (next.goalsDone.includes(call.args.goal_id)) return next;
      return { ...next, goalsDone: [...next.goalsDone, call.args.goal_id] };
  }
}

export function conversationReducer(s: ConversationState, a: Action): ConversationState {
  switch (a.type) {
    case "connected":
      return s.connectedAt ? s : { ...s, connectedAt: a.now };
    case "gloss":
      return patchTurn(s, a.id, (t) => ({ ...t, gloss: a.gloss }));
    case "notice":
      return {
        ...s,
        notices: [
          ...s.notices,
          { id: `n${s.notices.length}-${s.turns.length}`, afterTurnId: lastTurnId(s), text: a.text, kind: a.kind },
        ],
      };
    case "tools":
      return a.calls.reduce((acc, c) => applyTool(acc, c.callId, c.call), s);
    case "server":
      return applyServerEvent(s, a.event, a.now);
  }
}

function applyServerEvent(s: ConversationState, e: ServerEvent, now: number): ConversationState {
  switch (e.type) {
    case "input_audio_buffer.speech_started": {
      let next: ConversationState = { ...s, learnerSpeaking: true };
      // Barge-in: only a line still being spoken can be cut short. A response
      // that has started but not yet produced speech interrupts nothing.
      const cut = s.partnerSpeaking
        ? [...s.turns].reverse().find((t) => t.role === "partner")
        : s.turns.find((t) => t.role === "partner" && t.pending && t.text);
      if (cut) next = patchTurn(next, cut.id, (t) => ({ ...t, interrupted: true }));
      return ensureTurn(next, e.item_id, "learner", now);
    }
    case "input_audio_buffer.speech_stopped":
      return { ...s, learnerSpeaking: false };
    case "input_audio_buffer.committed":
      return ensureTurn(s, e.item_id, "learner", now);
    case "conversation.item.added":
    case "conversation.item.created":
      if (e.item?.type === "message" && e.item.role === "user") return ensureTurn(s, e.item.id, "learner", now);
      if (e.item?.type === "message" && e.item.role === "assistant") return ensureTurn(s, e.item.id, "partner", now);
      return s;
    case "conversation.item.input_audio_transcription.delta":
      return patchTurn(ensureTurn(s, e.item_id, "learner", now), e.item_id, (t) => ({
        ...t,
        text: t.text + (e.delta ?? ""),
      }));
    case "conversation.item.input_audio_transcription.completed":
      return finishText(ensureTurn(s, e.item_id, "learner", now), e.item_id, e.transcript ?? "");
    case "conversation.item.input_audio_transcription.failed":
      return dropTurn(s, e.item_id);
    case "response.created":
      return { ...s, responseActive: true, anchorTurnId: lastLearnerId(s) };
    case "response.output_item.added":
      if (e.item?.type === "message") return ensureTurn(s, e.item.id, "partner", now);
      return s;
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
      return patchTurn(ensureTurn(s, e.item_id, "partner", now), e.item_id, (t) => ({
        ...t,
        text: t.text + (e.delta ?? ""),
      }));
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      return finishText(ensureTurn(s, e.item_id, "partner", now), e.item_id, e.transcript ?? "");
    case "response.done": {
      // Lines cut off before their transcript finished keep what was heard.
      const turns = s.turns
        .map((t) => (t.role === "partner" && t.pending ? { ...t, pending: false, text: t.text.trim() } : t))
        .filter((t) => !(t.role === "partner" && !t.pending && !t.text));
      return { ...s, responseActive: false, turns };
    }
    case "output_audio_buffer.started":
      return { ...s, partnerSpeaking: true };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return { ...s, partnerSpeaking: false };
    default:
      return s;
  }
}

export type ToolFollowUp = {
  calls: { callId: string; name: string; rawArgs: string; call: ToolCall | null }[];
  /** The response held only tool calls, so the partner has not spoken yet. */
  needsResponse: boolean;
};

/** Tool calls in a finished response, and whether the partner still owes a spoken reply. */
export function toolFollowUp(e: ServerEvent): ToolFollowUp {
  const output = e.response?.output ?? [];
  const calls = output
    .filter((o) => o.type === "function_call" && o.call_id && o.name)
    .map((o) => ({
      callId: o.call_id!,
      name: o.name!,
      rawArgs: o.arguments ?? "{}",
      call: parseToolCall(o.name!, o.arguments ?? "{}"),
    }));
  const spoke = output.some((o) => o.type === "message");
  return { calls, needsResponse: calls.length > 0 && !spoke && e.response?.status === "completed" };
}

/** The transcript as stored: finished lines only. */
export function toTranscript(s: ConversationState, now: number, ended: boolean): Transcript {
  const kept = s.turns.filter((t) => t.text.trim());

  return {
    turns: kept.map(({ role, text, lang, gloss, at, interrupted }) => ({
      role,
      text,
      lang,
      at,
      ...(gloss ? { gloss } : {}),
      ...(interrupted ? { interrupted } : {}),
    })),
    corrections: s.corrections.map(({ turnId, ...c }) => {
      const k = kept.findIndex((t) => t.id === turnId);
      return { ...c, turnIndex: k >= 0 ? k : null };
    }),
    vocabulary: s.vocabulary,
    goalsDone: s.goalsDone,
    durationSec: Math.round(elapsed(s, now) / 1000),
    ended,
  };
}

/** Corrections with indexes into the given turns, for rendering. */
export function indexCorrections(turns: { id?: string }[], corrections: LiveCorrection[]): Correction[] {
  return corrections.map(({ turnId, ...c }) => {
    const k = turns.findIndex((t) => t.id === turnId);
    return { ...c, turnIndex: k >= 0 ? k : null };
  });
}

/** Notices with the index of the turn they follow (-1: before the first), for rendering. */
export function indexNotices(turns: { id?: string }[], notices: Notice[]) {
  return notices.map((n) => ({ ...n, afterTurn: n.afterTurnId ? turns.findIndex((t) => t.id === n.afterTurnId) : -1 }));
}
