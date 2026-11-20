import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestError } from "./badrequest";
import { MAX_UPLOAD_BYTES, INBOX_DIR, inspectBackup, newStaging, discardStaging, type BackupSummary } from "./backup";

class Cap extends Transform {
  bytes = 0;
  constructor(private readonly limit: number) {
    super();
  }
  override _transform(chunk: Buffer, _e: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) return cb(new BadRequestError(tooLarge()));
    cb(null, chunk);
  }
}

const tooLarge = () =>
  `That backup is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 ** 2)} MB, the most the browser upload accepts. Copy the ZIP into the "${INBOX_DIR}" folder inside the data folder and choose it from the list instead.`;

/** Save a request body (the raw ZIP) to a new staging folder and check it. */
export async function stageUpload(req: Request, root: string): Promise<{ token: string; summary: BackupSummary }> {
  if (!req.body) throw new BadRequestError("Choose a backup ZIP to restore.");
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) throw new BadRequestError(tooLarge());
  const { token, staging } = newStaging(root, { kind: "upload" });
  const file = path.join(staging, "upload.zip");
  const cap = new Cap(MAX_UPLOAD_BYTES);
  try {
    await pipeline(Readable.fromWeb(req.body as never), cap, fs.createWriteStream(file));
    if (Number.isFinite(declared) && declared > 0 && cap.bytes !== declared) {
      throw new BadRequestError(
        "The upload was cut short, so the backup is incomplete. Try again, or copy the ZIP into the restore-inbox folder.",
      );
    }
    const { summary } = await inspectBackup(file, staging);
    return { token, summary };
  } catch (e) {
    discardStaging(root, token);
    throw e;
  }
}
