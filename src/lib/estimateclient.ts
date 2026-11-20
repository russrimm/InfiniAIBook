export type EstimateReply = {
  type: string;
  cents: number;
  display: string;
  lines: { label: string; cents: number; display: string }[];
  fits: boolean;
  message: string | null;
  confirmAboveCents: number | null;
};

/** Ask the server what a generation is expected to cost. Null when it cannot say; the caller then just proceeds. */
export async function fetchEstimate(type: string, body: Record<string, unknown>): Promise<EstimateReply | null> {
  try {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, type }),
    });
    if (!res.ok) return null;
    return (await res.json()) as EstimateReply;
  } catch {
    return null;
  }
}

/** One line for the status view: what it is expected to cost, and that this is an estimate. */
export function estimateNote(e: EstimateReply): string {
  return e.cents > 0
    ? `Estimated cost: about ${e.display}. This is an estimate, not a quote.`
    : "Estimated cost: under a cent for the model calls.";
}

/** The breakdown, for a confirmation that spells out where the money goes. */
export function estimateBreakdown(e: EstimateReply): string {
  return e.lines.map((l) => `${l.label}: ${l.display}`).join("; ");
}

export function shouldConfirm(e: EstimateReply): boolean {
  return e.confirmAboveCents !== null && e.cents >= e.confirmAboveCents;
}
