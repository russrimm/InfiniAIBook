import path from "node:path";
import { readBody, BadRequestError } from "@/lib/badrequest";
import {
  INBOX_DIR,
  MAX_UPLOAD_BYTES,
  inboxDir,
  inspectBackup,
  listInbox,
  newStaging,
  discardStaging,
} from "@/lib/backup";
import { stageUpload } from "@/lib/backupupload";
import { fail, ok } from "@/lib/http";
import { dataDir } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Backups waiting in the data folder's restore-inbox, for archives too large to upload. */
export async function GET() {
  try {
    return ok({ inbox: listInbox(), inboxPath: inboxDir(), inboxName: INBOX_DIR, maxUploadBytes: MAX_UPLOAD_BYTES });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Step one of a restore: receive a backup (a raw ZIP body, or `{ "inbox": name }`
 * for a file already in the restore-inbox folder), check it, and answer with
 * what it contains and a token. Nothing is replaced until the token is
 * confirmed at /api/backup/restore/{token}.
 */
export async function POST(req: Request) {
  try {
    const root = dataDir();
    if (req.headers.get("content-type")?.includes("application/json")) {
      const { inbox } = await readBody<{ inbox?: unknown }>(req);
      if (typeof inbox !== "string" || !listInbox(root).some((f) => f.name === inbox)) {
        throw new BadRequestError(`Choose a ZIP that is in the ${INBOX_DIR} folder.`);
      }
      const { token, staging } = newStaging(root, { kind: "inbox", name: inbox });
      try {
        const { summary } = await inspectBackup(path.join(inboxDir(root), inbox), staging);
        return ok({ token, summary });
      } catch (e) {
        discardStaging(root, token);
        throw e;
      }
    }
    return ok(await stageUpload(req, root));
  } catch (e) {
    return fail(e);
  }
}
