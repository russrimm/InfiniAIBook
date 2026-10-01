/**
 * Live discussion state, folded from realtime server events. Pure, so it can
 * be tested with recorded event sequences.
 *
 * Turns are keyed by the realtime item id: the user's transcription often
 * arrives after the AI has already answered, and must still land in order.
 * Citations, verdicts and notices point at turns by id, so dropping an empty
 * turn (noise, a cough) never moves them onto someone else's line.
 */
import type { DiscussionCitation, DiscussionToolCall, Verdict } from "./discussion";

export type LiveTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending: boolean;
  /** Milliseconds since the call connected. */
  at: number;
  cites: number[];
  interrupted?: boolean;
  typed?: boolean;
};

export type LiveResult = { turnId: string | null; question: string; verdict: Verdict; feedback: string };
export type LiveNotice = { id: string; afterTurnId: string | null; text: string };

export type DiscussionState = {
  turns: LiveTurn[];
  /** Every excerpt the AI has been given, by number. */
  citations: DiscussionCitation[];
  results: LiveResult[];
  notices: LiveNotice[];
  /** Citations recorded before the AI's spoken line for that response existed. */
  pendingCites: number[];
  /** The user turn the current response answers, fixed when it starts. */
  anchorTurnId: string | null;
  assistantSpeaking: boolean;
  userSpeaking: boolean;
  responseActive: boolean;
  connectedAt: number | null;
  seenCalls: string[];
};

export function initialDiscussion(citations: DiscussionCitation[] = []): DiscussionState {
  return {
    turns: [],
    citations,
    results: [],
    notices: [],
    pendingCites: [],
    anchorTurnId: null,
    assistantSpeaking: false,
    userSpeaking: false,
    responseActive: false,
    connectedAt: null,
    seenCalls: [],
  };
}

export type RealtimeEvent = {
  type: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  item?: { id?: string; type?: string; role?: string; content?: { type?: string; text?: string }[] };
  response?: {
    status?: string;
    output?: { type?: string; id?: string; call_id?: string; name?: string; arguments?: string }[];
  };
  error?: { code?: string; message?: string };
};

export type DiscussionAction =
  | { type: "connected"; now: number }
  | { type: "server"; event: RealtimeEvent; now: number }
  | { type: "tool"; callId: string; call: DiscussionToolCall; itemId: string | null }
  | { type: "excerpts"; citations: DiscussionCitation[]; query: string }
  | { type: "reset"; citations: DiscussionCitation[] };

const elapsed = (s: DiscussionState, now: number) => (s.connectedAt ? Math.max(0, now - s.connectedAt) : 0);

function ensureTurn(s: DiscussionState, id: string | undefined, role: LiveTurn["role"], now: number): DiscussionState {
  if (!id || s.turns.some((t) => t.id === id)) return s;
  const cites = role === "assistant" ? s.pendingCites : [];
  return {
    ...s,
    pendingCites: role === "assistant" ? [] : s.pendingCites,
    turns: [...s.turns, { id, role, text: "", pending: true, at: elapsed(s, now), cites }],
  };
}

function patchTurn(s: DiscussionState, id: string | undefined, patch: (t: LiveTurn) => LiveTurn): DiscussionState {
  if (!id) return s;
  return { ...s, turns: s.turns.map((t) => (t.id === id ? patch(t) : t)) };
}

const lastUserId = (s: DiscussionState) => [...s.turns].reverse().find((t) => t.role === "user")?.id ?? null;
const lastTurnId = (s: DiscussionState) => s.turns.at(-1)?.id ?? null;

function dropTurn(s: DiscussionState, id: string | undefined): DiscussionState {
  const i = s.turns.findIndex((t) => t.id === id);
  if (i < 0) return s;
  const removed = s.turns[i];
  const prevId = i > 0 ? s.turns[i - 1].id : null;
  const prevUserId = [...s.turns.slice(0, i)].reverse().find((t) => t.role === "user")?.id ?? null;
  return {
    ...s,
    turns: s.turns.filter((t) => t.id !== removed.id),
    pendingCites: removed.role === "assistant" ? [...new Set([...s.pendingCites, ...removed.cites])] : s.pendingCites,
    results: s.results.map((r) => (r.turnId === removed.id ? { ...r, turnId: prevUserId } : r)),
    notices: s.notices.map((n) => (n.afterTurnId === removed.id ? { ...n, afterTurnId: prevId } : n)),
    anchorTurnId: s.anchorTurnId === removed.id ? prevUserId : s.anchorTurnId,
  };
}

function finishText(s: DiscussionState, id: string | undefined, text: string): DiscussionState {
  const clean = text.trim();
  if (!clean) return dropTurn(s, id);
  return patchTurn(s, id, (t) => ({ ...t, text: clean, pending: false }));
}

function addCites(s: DiscussionState, numbers: number[], itemId: string | null): DiscussionState {
  const known = new Set(s.citations.map((c) => c.n));
  const valid = numbers.filter((n) => known.has(n));
  if (!valid.length) return s;
  const target = itemId && s.turns.some((t) => t.id === itemId) ? itemId : null;
  if (!target) return { ...s, pendingCites: [...new Set([...s.pendingCites, ...valid])] };
  return patchTurn(s, target, (t) => ({ ...t, cites: [...new Set([...t.cites, ...valid])] }));
}

export function discussionReducer(s: DiscussionState, a: DiscussionAction): DiscussionState {
  switch (a.type) {
    case "connected":
      return s.connectedAt ? s : { ...s, connectedAt: a.now };
    case "reset":
      return initialDiscussion(a.citations);
    case "excerpts": {
      const have = new Set(s.citations.map((c) => c.n));
      const fresh = a.citations.filter((c) => !have.has(c.n));
      return {
        ...s,
        citations: [...s.citations, ...fresh],
        notices: [
          ...s.notices,
          {
            id: `search-${s.notices.length}`,
            afterTurnId: lastTurnId(s),
            text: `Looked up “${a.query}” · ${a.citations.length} passage${a.citations.length === 1 ? "" : "s"}`,
          },
        ],
      };
    }
    case "tool": {
      if (s.seenCalls.includes(a.callId)) return s;
      const next = { ...s, seenCalls: [...s.seenCalls, a.callId] };
      if (a.call.name === "cite_sources") return addCites(next, a.call.args.excerpts, a.itemId);
      if (a.call.name === "record_answer") {
        return {
          ...next,
          results: [...next.results, { turnId: next.anchorTurnId ?? lastUserId(next), ...a.call.args }],
        };
      }
      return next;
    }
    case "server":
      return applyEvent(s, a.event, a.now);
  }
}

function applyEvent(s: DiscussionState, e: RealtimeEvent, now: number): DiscussionState {
  switch (e.type) {
    case "input_audio_buffer.speech_started": {
      let next: DiscussionState = { ...s, userSpeaking: true };
      // Only a line still being spoken can be cut short.
      const cut = s.assistantSpeaking
        ? [...s.turns].reverse().find((t) => t.role === "assistant")
        : s.turns.find((t) => t.role === "assistant" && t.pending && t.text);
      if (cut) next = patchTurn(next, cut.id, (t) => ({ ...t, interrupted: true }));
      return ensureTurn(next, e.item_id, "user", now);
    }
    case "input_audio_buffer.speech_stopped":
      return { ...s, userSpeaking: false };
    case "input_audio_buffer.committed":
      return ensureTurn(s, e.item_id, "user", now);
    case "conversation.item.added":
    case "conversation.item.created": {
      if (e.item?.type !== "message") return s;
      if (e.item.role === "assistant") return ensureTurn(s, e.item.id, "assistant", now);
      if (e.item.role !== "user") return s;
      const typed = e.item.content?.find((c) => c.type === "input_text")?.text;
      const next = ensureTurn(s, e.item.id, "user", now);
      return typed ? patchTurn(next, e.item.id, (t) => ({ ...t, text: typed.trim(), pending: false, typed: true })) : next;
    }
    case "conversation.item.input_audio_transcription.delta":
      return patchTurn(ensureTurn(s, e.item_id, "user", now), e.item_id, (t) => ({
        ...t,
        text: t.text + (e.delta ?? ""),
      }));
    case "conversation.item.input_audio_transcription.completed":
      return finishText(ensureTurn(s, e.item_id, "user", now), e.item_id, e.transcript ?? "");
    case "conversation.item.input_audio_transcription.failed":
      return dropTurn(s, e.item_id);
    case "response.created":
      return { ...s, responseActive: true, anchorTurnId: lastUserId(s) };
    case "response.output_item.added":
      return e.item?.type === "message" ? ensureTurn(s, e.item.id, "assistant", now) : s;
    case "response.output_audio_transcript.delta":
      return patchTurn(ensureTurn(s, e.item_id, "assistant", now), e.item_id, (t) => ({
        ...t,
        text: t.text + (e.delta ?? ""),
      }));
    case "response.output_audio_transcript.done":
      return finishText(ensureTurn(s, e.item_id, "assistant", now), e.item_id, e.transcript ?? "");
    case "response.done": {
      let next: DiscussionState = { ...s, responseActive: false };
      for (const t of s.turns) {
        if (t.role !== "assistant" || !t.pending) continue;
        next = t.text.trim()
          ? patchTurn(next, t.id, (x) => ({ ...x, pending: false, text: x.text.trim() }))
          : dropTurn(next, t.id);
      }
      return next;
    }
    case "output_audio_buffer.started":
      return { ...s, assistantSpeaking: true };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return { ...s, assistantSpeaking: false };
    default:
      return s;
  }
}

export type ResponseTools = {
  calls: { callId: string; name: string; call: DiscussionToolCall | null }[];
  /** The spoken line this response produced, if any, for attaching citations. */
  messageId: string | null;
  hasSearch: boolean;
  /** Completed with tool calls but no speech: the AI still owes a reply. */
  needsResponse: boolean;
};

export function responseTools(e: RealtimeEvent, parse: (name: string, raw: string) => DiscussionToolCall | null): ResponseTools {
  const output = e.response?.output ?? [];
  const calls = output
    .filter((o) => o.type === "function_call" && o.call_id && o.name)
    .map((o) => ({ callId: o.call_id!, name: o.name!, call: parse(o.name!, o.arguments ?? "{}") }));
  const messageId = output.find((o) => o.type === "message" && o.id)?.id ?? null;
  const completed = e.response?.status === "completed";
  const hasSearch = calls.some((c) => c.call?.name === "search_sources");
  return {
    calls,
    messageId,
    hasSearch,
    needsResponse: completed && calls.length > 0 && (hasSearch || !messageId),
  };
}

/** Finished lines, as saved to a note. */
export function savedTurns(s: DiscussionState) {
  return s.turns
    .filter((t) => t.text.trim())
    .map((t) => ({ role: t.role, text: t.text.trim(), cites: t.cites }));
}

/** Citations actually shown on some line, for the saved note. */
export function usedCitations(s: DiscussionState): DiscussionCitation[] {
  const used = new Set(s.turns.flatMap((t) => t.cites));
  return s.citations.filter((c) => used.has(c.n));
}
