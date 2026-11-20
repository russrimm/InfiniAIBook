import { Readable } from "node:stream";
import { backupFileName, createBackupStream, snapshotLiveDatabase } from "@/lib/backup";
import { db } from "@/lib/db";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * Download everything as one ZIP: a consistent snapshot of the database plus
 * the uploaded sources, artifacts and shared media. Secrets (.env files) are
 * never included. The archive streams, so it works for large libraries.
 */
export async function GET() {
  try {
    const stream = createBackupStream(snapshotLiveDatabase((sql) => db.exec(sql)));
    // Start now so a refusal (a restore is running) is a clean 400, not a broken download.
    const first = await stream.next();
    const body = Readable.toWeb(
      Readable.from(
        (async function* () {
          if (!first.done) yield first.value;
          yield* stream;
        })(),
      ),
    ) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${backupFileName()}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
