/**
 * Which retrieved passages an answer actually pointed at.
 *
 * A marker the model never wrote is not a citation. Attaching the top retrieved
 * passages anyway made an ungrounded answer look sourced.
 */
export function citationsUsed<T extends { n: number }>(text: string, citations: T[]): T[] {
  const used = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  if (!used.size) return [];
  return citations.filter((c) => used.has(c.n));
}

export const UNCITED_LABEL =
  "Not cited. This answer did not point at a source, so do not treat it as grounded.";

type HistoryTurn = { role: "user" | "assistant" | "system"; content: string };

/**
 * Conversation memory for the next prompt. Earlier replies stay so a follow-up
 * ("expand on that") has a referent, but they are labeled as not evidence and
 * their old citation numbers are stripped so they cannot be reused against a
 * new set of excerpts.
 */
export function historyForPrompt<T extends HistoryTurn>(history: T[]): T[] {
  return history.map((turn) => {
    if (turn.role !== "assistant") return turn;
    const stripped = turn.content
      .replace(/\[(\d+)\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
    return {
      ...turn,
      content: stripped
        ? `(Earlier reply, not a source. Do not treat it as evidence or reuse its citation numbers.) ${stripped}`
        : "(Earlier reply omitted. It is not a source.)",
    };
  });
}
