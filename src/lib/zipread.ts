import type JSZip from "jszip";
import { mb } from "./limits";

export class ArchiveLimitError extends Error {}

const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_LOCATOR64 = 0x07064b50;
const SIG_EOCD64 = 0x06064b50;

/**
 * How many entries a ZIP's central directory lists, counted by walking it and
 * stopping once `limit` is passed. The count in the end-of-directory record is
 * written by whoever made the file, and JSZip reads headers until they stop
 * matching, so neither is trusted. Null when no directory is found; JSZip
 * then reports the real problem.
 */
export function countZipEntries(data: Uint8Array, limit: number): number | null {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let offset = buf.readUInt32LE(eocd + 16);
  const size = buf.readUInt32LE(eocd + 12);
  if (offset === 0xffffffff && eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_LOCATOR64) {
    const record = Number(buf.readBigUInt64LE(eocd - 12));
    if (record + 56 <= buf.length && buf.readUInt32LE(record) === SIG_EOCD64) {
      offset = Number(buf.readBigUInt64LE(record + 48));
    }
  }
  // Like JSZip, accept a directory that sits right before the end record when
  // the stated offset is off (a file with bytes prepended to it).
  const start = [offset, eocd - size].find(
    (at) => at >= 0 && at + 46 <= buf.length && buf.readUInt32LE(at) === SIG_CENTRAL
  );
  if (start === undefined) return 0;

  let at = start;
  let count = 0;
  while (count <= limit && at + 46 <= buf.length && buf.readUInt32LE(at) === SIG_CENTRAL) {
    at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    count++;
  }
  return count;
}

/** Refuse an archive that lists more than `limit` entries, before JSZip builds an object for each. */
export function assertZipEntryCount(data: Uint8Array, limit: number): void {
  const count = countZipEntries(data, limit);
  if (count !== null && count > limit) {
    throw new ArchiveLimitError(`it lists more than ${limit.toLocaleString("en-US")} files`);
  }
}

/** Inflate one entry only to learn that it stays within `cap` bytes; nothing is kept. */
export function measureEntryCapped(entry: JSZip.JSZipObject, cap: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const stream = entry.nodeStream("nodebuffer");
    stream
      .on("data", (chunk: Buffer) => {
        if (done) return;
        size += chunk.length;
        if (size > cap) {
          done = true;
          stream.pause();
          reject(new ArchiveLimitError(`it expands to more than ${mb(cap)}`));
        }
      })
      .on("error", (e: Error) => {
        if (done) return;
        done = true;
        reject(e);
      })
      .on("end", () => {
        if (done) return;
        done = true;
        resolve(size);
      })
      .resume();
  });
}

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
