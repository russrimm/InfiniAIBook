import { BadRequestError, readBody } from "@/lib/badrequest";
import { discardStaging, restoreStaged } from "@/lib/backup";
import { closeDb } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { keepAliveJSON } from "@/lib/keepalive";
import { dataDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

type Ctx = { params: Promise<{ token: string }> };

/**
 * Step two: replace the current data with the checked backup. The body must be
 * `{ "confirm": "replace" }`, so nothing is overwritten by accident. The
 * current data is kept in a hidden `.pre-restore-*` folder inside the data
 * folder until you delete it.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  return keepAliveJSON(async () => {
    try {
      const { confirm } = await readBody<{ confirm?: unknown }>(req);
      if (confirm !== "replace") {
        throw new BadRequestError('Confirm that the restore replaces all current data by sending { "confirm": "replace" }.');
      }
      const result = await restoreStaged(token, { root: dataDir(), closeDb });
      return ok({
        restored: true,
        summary: result.summary,
        previousFolder: result.previousFolder,
      });
    } catch (e) {
      return fail(e);
    }
  });
}

/** Throw away a checked backup that will not be restored. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { token } = await params;
    discardStaging(dataDir(), token);
    return ok({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
