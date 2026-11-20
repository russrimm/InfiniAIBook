import fs from "node:fs";
import { PassThrough, Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pipeline as pipelineCb } from "node:stream";
import zlib from "node:zlib";

/**
 * A small streaming ZIP writer and a bounded reader, for backups that can be
 * many gigabytes (JSZip holds a whole archive in memory). Both sides handle
 * ZIP64, so neither the archive nor any file inside has a 4 GB ceiling.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_DESCRIPTOR = 0x08074b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50;
const SIG_LOCATOR64 = 0x07064b50;
const U32 = 0xffffffff;
const U16 = 0xffff;
const FLAG_ENCRYPTED = 0x1;
const FLAG_DESCRIPTOR = 0x8;
const FLAG_UTF8 = 0x800;
const MAX_EXTRA_EOCD_SCAN = 22 + 0xffff;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

export type ZipSource = {
  /** Path inside the archive, with forward slashes. */
  name: string;
  mtime?: Date;
  /** Already-compressed media gains nothing from deflate. */
  store?: boolean;
  /** Size in bytes when known up front; decides whether the entry needs ZIP64. */
  size: number;
  open: () => Readable | Buffer;
};

type Written = {
  name: Buffer;
  flags: number;
  method: number;
  time: number;
  date: number;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
  zip64Local: boolean;
};

function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}
function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

/** Counts bytes and keeps a running CRC-32 of what passes through. */
class Measure extends Transform {
  crc = 0;
  bytes = 0;
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) {
    this.crc = zlib.crc32(chunk, this.crc);
    this.bytes += chunk.length;
    cb(null, chunk);
  }
}

/**
 * Yield a ZIP archive, one buffer at a time. Entries use data descriptors, so a
 * file that changes while it is read is still archived consistently (what was
 * read is what is recorded). `zip64At` is the size from which an entry is
 * written with ZIP64 fields; it is a parameter so tests can exercise ZIP64
 * without a multi-gigabyte file.
 */
export async function* writeZip(
  sources: Iterable<ZipSource>,
  { zip64At = 0xf0000000 }: { zip64At?: number } = {},
): AsyncGenerator<Buffer> {
  let pos = 0;
  const done: Written[] = [];
  const emit = (b: Buffer) => {
    pos += b.length;
    return b;
  };

  for (const src of sources) {
    const name = Buffer.from(src.name, "utf8");
    const { time, date } = dosDateTime(src.mtime ?? new Date());
    const method = src.store ? 0 : 8;
    const zip64Local = src.size >= zip64At;
    const flags = FLAG_DESCRIPTOR | FLAG_UTF8;
    const entry: Written = {
      name, flags, method, time, date, crc: 0, csize: 0, usize: 0, offset: pos, zip64Local,
    };

    const extra = zip64Local ? Buffer.concat([u16(1), u16(16), u64(0), u64(0)]) : Buffer.alloc(0);
    yield emit(
      Buffer.concat([
        u32(SIG_LOCAL), u16(zip64Local ? 45 : 20), u16(flags), u16(method), u16(time), u16(date),
        u32(0), u32(zip64Local ? U32 : 0), u32(zip64Local ? U32 : 0),
        u16(name.length), u16(extra.length), name, extra,
      ]),
    );

    const data = src.open();
    const measure = new Measure();
    let csize = 0;
    if (Buffer.isBuffer(data)) {
      measure.crc = zlib.crc32(data);
      measure.bytes = data.length;
      const body = method === 8 ? zlib.deflateRawSync(data) : data;
      csize = body.length;
      if (csize) yield emit(body);
    } else {
      const tail = new PassThrough();
      const stages: (NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream)[] =
        method === 8 ? [data, measure, zlib.createDeflateRaw(), tail] : [data, measure, tail];
      pipelineCb(stages as [NodeJS.ReadableStream, ...NodeJS.ReadWriteStream[], NodeJS.WritableStream], (err) => {
        if (err) tail.destroy(err);
      });
      for await (const chunk of tail) {
        csize += (chunk as Buffer).length;
        yield emit(chunk as Buffer);
      }
    }

    entry.crc = measure.crc >>> 0;
    entry.usize = measure.bytes;
    entry.csize = csize;
    if (!zip64Local && (entry.usize >= U32 || entry.csize >= U32)) {
      throw new ZipError(`"${src.name}" grew past 4 GB while it was being archived. Try the backup again.`);
    }
    yield emit(
      Buffer.concat(
        zip64Local
          ? [u32(SIG_DESCRIPTOR), u32(entry.crc), u64(entry.csize), u64(entry.usize)]
          : [u32(SIG_DESCRIPTOR), u32(entry.crc), u32(entry.csize), u32(entry.usize)],
      ),
    );
    done.push(entry);
  }

  const cdStart = pos;
  for (const e of done) {
    const big: Buffer[] = [];
    const csize32 = e.csize >= U32 || e.zip64Local ? U32 : e.csize;
    const usize32 = e.usize >= U32 || e.zip64Local ? U32 : e.usize;
    const offset32 = e.offset >= U32 ? U32 : e.offset;
    if (usize32 === U32) big.push(u64(e.usize));
    if (csize32 === U32) big.push(u64(e.csize));
    if (offset32 === U32) big.push(u64(e.offset));
    const extra = big.length ? Buffer.concat([u16(1), u16(big.length * 8), ...big]) : Buffer.alloc(0);
    yield emit(
      Buffer.concat([
        u32(SIG_CENTRAL), u16((3 << 8) | 45), u16(big.length ? 45 : 20), u16(e.flags), u16(e.method),
        u16(e.time), u16(e.date), u32(e.crc), u32(csize32), u32(usize32),
        u16(e.name.length), u16(extra.length), u16(0), u16(0), u16(0),
        u32(((0o100644 << 16) | 0) >>> 0), u32(offset32), e.name, extra,
      ]),
    );
  }
  const cdSize = pos - cdStart;
  const needs64 = done.length >= U16 || cdStart >= U32 || cdSize >= U32;
  if (needs64) {
    const eocd64 = pos;
    yield emit(
      Buffer.concat([
        u32(SIG_EOCD64), u64(44), u16((3 << 8) | 45), u16(45), u32(0), u32(0),
        u64(done.length), u64(done.length), u64(cdSize), u64(cdStart),
      ]),
    );
    yield emit(Buffer.concat([u32(SIG_LOCATOR64), u32(0), u64(eocd64), u32(1)]));
  }
  yield emit(
    Buffer.concat([
      u32(SIG_EOCD), u16(0), u16(0),
      u16(needs64 ? U16 : done.length), u16(needs64 ? U16 : done.length),
      u32(needs64 ? U32 : cdSize), u32(needs64 ? U32 : cdStart), u16(0),
    ]),
  );
}

export type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
  /** Unix file type bits when the archive came from a Unix-like system. */
  unixMode: number | null;
  isDirectory: boolean;
};

export type ZipLimits = {
  maxEntries: number;
  maxDirectoryBytes: number;
};

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 200_000, maxDirectoryBytes: 64 * 1024 * 1024 };

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  let got = 0;
  while (got < length) {
    const n = fs.readSync(fd, buf, got, length - got, position + got);
    if (n === 0) throw new ZipError("The archive ends unexpectedly. It looks truncated or incomplete.");
    got += n;
  }
  return buf;
}

/** Read an archive's central directory without extracting anything. */
export function readZipDirectory(file: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    if (size < 22) throw new ZipError("That file is not a ZIP archive.");
    const scan = Math.min(size, MAX_EXTRA_EOCD_SCAN);
    const tail = readAt(fd, size - scan, scan);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === SIG_EOCD && i + 22 + tail.readUInt16LE(i + 20) <= tail.length) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ZipError("That file is not a complete ZIP archive (no end-of-archive record). It may be truncated.");
    let entries = tail.readUInt16LE(eocd + 10);
    let cdSize = tail.readUInt32LE(eocd + 12);
    let cdOffset = tail.readUInt32LE(eocd + 16);
    if (tail.readUInt16LE(eocd + 4) !== 0 || tail.readUInt16LE(eocd + 6) !== 0) {
      throw new ZipError("Multi-part ZIP archives are not supported.");
    }
    if (entries === U16 || cdSize === U32 || cdOffset === U32) {
      const locAt = size - scan + eocd - 20;
      if (locAt < 0) throw new ZipError("The ZIP64 end-of-archive record is missing.");
      const loc = readAt(fd, locAt, 20);
      if (loc.readUInt32LE(0) !== SIG_LOCATOR64) throw new ZipError("The ZIP64 end-of-archive record is missing.");
      const at = Number(loc.readBigUInt64LE(8));
      if (!Number.isSafeInteger(at) || at + 56 > size) throw new ZipError("The ZIP64 end-of-archive record is invalid.");
      const rec = readAt(fd, at, 56);
      if (rec.readUInt32LE(0) !== SIG_EOCD64) throw new ZipError("The ZIP64 end-of-archive record is invalid.");
      entries = Number(rec.readBigUInt64LE(32));
      cdSize = Number(rec.readBigUInt64LE(40));
      cdOffset = Number(rec.readBigUInt64LE(48));
    }
    if (![entries, cdSize, cdOffset].every(Number.isSafeInteger)) throw new ZipError("The archive directory is invalid.");
    if (entries > limits.maxEntries) {
      throw new ZipError(`The archive lists ${entries.toLocaleString("en-US")} files, more than the ${limits.maxEntries.toLocaleString("en-US")} allowed.`);
    }
    if (cdSize > limits.maxDirectoryBytes || cdOffset + cdSize > size) {
      throw new ZipError("The archive directory is invalid or larger than expected. The file may be corrupted.");
    }
    const dir = readAt(fd, cdOffset, cdSize);
    const out: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < entries; i++) {
      if (p + 46 > dir.length || dir.readUInt32LE(p) !== SIG_CENTRAL) {
        throw new ZipError("The archive directory is corrupted.");
      }
      const madeBy = dir.readUInt16LE(p + 4);
      const flags = dir.readUInt16LE(p + 8);
      const method = dir.readUInt16LE(p + 10);
      const crc = dir.readUInt32LE(p + 16);
      let csize = dir.readUInt32LE(p + 20);
      let usize = dir.readUInt32LE(p + 24);
      const nameLen = dir.readUInt16LE(p + 28);
      const extraLen = dir.readUInt16LE(p + 30);
      const commentLen = dir.readUInt16LE(p + 32);
      const disk = dir.readUInt16LE(p + 34);
      const external = dir.readUInt32LE(p + 38);
      let offset = dir.readUInt32LE(p + 42);
      const end = p + 46 + nameLen + extraLen + commentLen;
      if (end > dir.length) throw new ZipError("The archive directory is corrupted.");
      if (disk !== 0) throw new ZipError("Multi-part ZIP archives are not supported.");
      const name = dir.toString("utf8", p + 46, p + 46 + nameLen);
      let x = p + 46 + nameLen;
      const xEnd = x + extraLen;
      while (x + 4 <= xEnd) {
        const id = dir.readUInt16LE(x);
        const len = dir.readUInt16LE(x + 2);
        if (x + 4 + len > xEnd) break;
        if (id === 1) {
          let q = x + 4;
          const take = () => {
            if (q + 8 > x + 4 + len) throw new ZipError("The archive directory is corrupted.");
            const v = Number(dir.readBigUInt64LE(q));
            q += 8;
            return v;
          };
          if (usize === U32) usize = take();
          if (csize === U32) csize = take();
          if (offset === U32) offset = take();
        }
        x += 4 + len;
      }
      const unix = (madeBy >> 8) === 3;
      out.push({
        name, flags, method, crc, csize, usize, offset,
        unixMode: unix ? (external >>> 16) & 0xffff : null,
        isDirectory: name.endsWith("/"),
      });
      p = end;
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

class Verify extends Transform {
  crc = 0;
  bytes = 0;
  constructor(private readonly limit: number, private readonly label: string) {
    super();
  }
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) {
    this.bytes += chunk.length;
    if (this.bytes > this.limit) {
      return cb(new ZipError(`"${this.label}" is larger than the archive says it is. The archive is corrupted or malicious.`));
    }
    this.crc = zlib.crc32(chunk, this.crc);
    cb(null, chunk);
  }
}

/**
 * Extract one entry to `dest`, which must not exist. The data is checked
 * against the archive's recorded size and CRC-32, and inflating stops as soon
 * as it outgrows the recorded size (a decompression bomb).
 */
export async function extractZipEntry(file: string, entry: ZipEntry, dest: string | null): Promise<void> {
  const fd = fs.openSync(file, "r");
  let dataStart: number;
  try {
    const size = fs.fstatSync(fd).size;
    if (entry.flags & FLAG_ENCRYPTED) throw new ZipError(`"${entry.name}" is encrypted, which backups never are.`);
    if (entry.method !== 0 && entry.method !== 8) throw new ZipError(`"${entry.name}" uses an unsupported compression method.`);
    if (entry.offset + 30 > size) throw new ZipError("The archive ends unexpectedly. It looks truncated or incomplete.");
    const head = readAt(fd, entry.offset, 30);
    if (head.readUInt32LE(0) !== SIG_LOCAL) throw new ZipError(`The record for "${entry.name}" is corrupted.`);
    const nameLen = head.readUInt16LE(26);
    const extraLen = head.readUInt16LE(28);
    const localName = readAt(fd, entry.offset + 30, nameLen).toString("utf8");
    if (localName !== entry.name) throw new ZipError(`The record for "${entry.name}" does not match the archive directory.`);
    dataStart = entry.offset + 30 + nameLen + extraLen;
    if (dataStart + entry.csize > size) throw new ZipError("The archive ends unexpectedly. It looks truncated or incomplete.");
  } finally {
    fs.closeSync(fd);
  }

  const verify = new Verify(entry.usize, entry.name);
  const stages: (NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream)[] = [];
  stages.push(
    entry.csize === 0
      ? Readable.from([])
      : fs.createReadStream(file, { start: dataStart, end: dataStart + entry.csize - 1 }),
  );
  if (entry.method === 8) stages.push(zlib.createInflateRaw());
  stages.push(verify);
  if (dest) stages.push(fs.createWriteStream(dest, { flags: "wx" }));
  else stages.push(new PassThrough().resume());
  try {
    await pipeline(stages as [NodeJS.ReadableStream, ...NodeJS.ReadWriteStream[], NodeJS.WritableStream]);
  } catch (e) {
    if ((e as { code?: string }).code === "EEXIST") throw e;
    if (dest) fs.rmSync(dest, { force: true });
    if (e instanceof ZipError) throw e;
    throw new ZipError(`"${entry.name}" could not be read from the archive (${(e as Error).message}). It may be corrupted.`);
  }
  if (verify.bytes !== entry.usize || verify.crc >>> 0 !== entry.crc) {
    if (dest) fs.rmSync(dest, { force: true });
    throw new ZipError(`"${entry.name}" failed its integrity check. The archive is corrupted.`);
  }
}

/**
 * A relative archive path that stays inside the folder it is extracted to, on
 * Windows as well as POSIX. Returns the path split into parts, or throws.
 */
export function safeEntryParts(name: string): string[] {
  const bad = () => new ZipError(`The archive contains an unsafe path ("${name.slice(0, 80)}"), so it was refused.`);
  if (!name || name.length > 1024) throw bad();
  if (/[\\\u0000-\u001f<>:"|?*]/.test(name)) throw bad();
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw bad();
  const parts = name.replace(/\/$/, "").split("/");
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.length > 255) throw bad();
    if (/[. ]$/.test(part)) throw bad();
  }
  return parts;
}
