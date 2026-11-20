import { BadRequestError } from "@/lib/badrequest";
import { fail, ok } from "@/lib/http";
import { cancelJob } from "@/lib/jobs";
import { cancelTrainingRender } from "@/lib/trainingbuild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stop a running generation or build and its provider calls. `id` is either the
 * job id the browser sent in the x-job-id header of a generation request, or the
 * id of an item that is being narrated, drawn or rendered. Work already paid for
 * is not refunded; nothing more is spent after this returns. `cancelled` is false
 * when nothing was running (it may have just finished).
 */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) throw new BadRequestError("That is not a valid job id.");
    return ok({ cancelled: cancelJob(id) || cancelTrainingRender(id) });
  } catch (e) {
    return fail(e);
  }
}
