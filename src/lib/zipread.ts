import type JSZip from "jszip";
import { mb } from "./limits";

export class ArchiveLimitError extends Error {}

/**
 * Decompress one entry, giving up as soon as it passes `cap` bytes, so a
 * small archive that inflates to gigabytes (a "zip bomb") is stopped early
 * rather than after it has filled memory.
 */
export function readEntryCapped(entry: JSZip.JSZipObject, cap: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    let done = false;
    const stream = entry.nodeStream("nodebuffer");
    stream
      .on("data", (chunk: Buffer) => {
        if (done) return;
        size += chunk.length;
        if (size > cap) {
          done = true;
          // Backpressure then pauses the inflater itself.
          stream.pause();
          reject(new ArchiveLimitError(`it expands to more than ${mb(cap)}`));
          return;
        }
        parts.push(chunk);
      })
      .on("error", (e: Error) => {
        if (done) return;
        done = true;
        reject(e);
      })
      .on("end", () => {
        if (done) return;
        done = true;
        resolve(Buffer.concat(parts, size));
      })
      .resume();
  });
}
