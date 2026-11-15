import type { TurnRow } from "./sessions";

/** How many earlier turns are sent to the model as conversation memory. */
export const HISTORY_TURNS = 8;

export type TurnMode = "regenerate" | "edit";

export type TurnPlan = {
  /** The question the model answers: the typed one, the edited one, or the one being re-answered. */
  question: string;
  /** Turns before the question, oldest first, as conversation memory. */
  history: TurnRow[];
  mode?: TurnMode;
  /** Regenerate: the answer the new one replaces once it exists. */
  replaceId?: string;
  /** Edit: the user message that, with everything after it, is discarded once the model has started. */
  truncateId?: string;
};

/** A request that cannot be honored; carries the HTTP status to answer with. */
export class TurnError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "TurnError";
  }
}

/**
 * Decide what a chat request does to a session, without touching it.
 *
 * A plain request appends a question. `regenerate` re-answers the last
 * question and may only target the session's last answer, so history never
 * forks. `edit` replaces a user message and discards what followed it.
 */
export function planTurn(
  rows: TurnRow[],
  message: string,
  mode?: unknown,
  messageId?: unknown
): TurnPlan {
  if (mode === undefined || mode === null) {
    return { question: message, history: rows.slice(-HISTORY_TURNS) };
  }
  if (mode !== "regenerate" && mode !== "edit") {
    throw new TurnError("Unknown chat action.", 400, "invalid_turn");
  }
  if (typeof messageId !== "string" || !messageId) {
    throw new TurnError("Say which message to change.", 400, "invalid_turn");
  }
  const index = rows.findIndex((r) => r.id === messageId);
  if (index < 0) {
    throw new TurnError("That message no longer exists.", 404, "message_not_found");
  }
  const target = rows[index];

  if (mode === "regenerate") {
    if (target.role !== "assistant" || index !== rows.length - 1 || rows[index - 1]?.role !== "user") {
      throw new TurnError("Only the latest answer can be regenerated.", 409, "not_latest");
    }
    return {
      question: rows[index - 1].content,
      history: rows.slice(0, index - 1).slice(-HISTORY_TURNS),
      mode,
      replaceId: target.id,
    };
  }

  if (target.role !== "user") {
    throw new TurnError("Only your own messages can be edited.", 400, "invalid_turn");
  }
  return {
    question: message,
    history: rows.slice(0, index).slice(-HISTORY_TURNS),
    mode,
    truncateId: target.id,
  };
}
