import { ok, fail } from "@/lib/http";
import { cancelClipRun } from "@/lib/videoclipstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Stop a run. Clips already finished are kept; the rest are cancelled and deleted at the provider. */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return ok({ cancelled: cancelClipRun(id) });
  } catch (e) {
    return fail(e);
  }
}
