import { ok, fail } from "@/lib/http";
import { budgetStatus } from "@/lib/budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's estimated model spend against the daily ceiling. */
export async function GET() {
  try {
    return ok(budgetStatus());
  } catch (e) {
    return fail(e);
  }
}
