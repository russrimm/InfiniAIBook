import { assertCanAfford, budgetStatus } from "@/lib/budget";
import { BadRequestError, readBody } from "@/lib/badrequest";
import { confirmAboveCents, estimateGeneration, formatUsd } from "@/lib/estimates";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a Studio generation is expected to cost, before it starts. Send the
 * same options the generator takes plus its `type`. The numbers are estimates
 * (see docs/costs-and-budget.md); `fits` says whether today's budget could pay
 * for it, and `confirmAboveCents` is the size from which the app asks first.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody<Record<string, unknown>>(req);
    const type = typeof body.type === "string" ? body.type : "";
    const estimate = estimateGeneration(type, body);
    if (!estimate) throw new BadRequestError(`No cost estimate is available for "${type.slice(0, 40)}".`);

    let fits = true;
    let message: string | null = null;
    try {
      assertCanAfford(estimate.cents);
    } catch (e) {
      fits = false;
      message = e instanceof Error ? e.message : "This does not fit today's budget.";
    }
    return ok({
      type,
      cents: estimate.cents,
      usd: estimate.cents / 100,
      display: formatUsd(estimate.cents),
      lines: estimate.lines.map((l) => ({ label: l.label, cents: l.cents, display: formatUsd(l.cents) })),
      fits,
      message,
      confirmAboveCents: confirmAboveCents(),
      budget: budgetStatus(),
    });
  } catch (e) {
    return fail(e);
  }
}
