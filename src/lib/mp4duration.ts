import fs from "node:fs";

/**
 * The length of an MP4 in seconds, read from its movie header, or null when it
 * has none. Only box headers are read, so a 100 MB file costs a few small reads
 * and no Python or ffmpeg is needed to accept an upload.
 */
export function mp4Seconds(file: string): number | null {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const header = Buffer.alloc(16);

    /** Walk the boxes in [start, end) for `type`, returning where its content starts and ends. */
    const find = (start: number, end: number, type: string): [number, number] | null => {
      let at = start;
      while (at + 8 <= end) {
        if (fs.readSync(fd, header, 0, 16, at) < 8) return null;
        let length = header.readUInt32BE(0);
        let head = 8;
        if (length === 1) {
          length = Number(header.readBigUInt64BE(8));
          head = 16;
        } else if (length === 0) {
          length = end - at;
        }
        if (length < head) return null;
        if (header.toString("latin1", 4, 8) === type) return [at + head, Math.min(at + length, end)];
        at += length;
      }
      return null;
    };

    const moov = find(0, size, "moov");
    const mvhd = moov && find(moov[0], moov[1], "mvhd");
    if (!mvhd) return null;
    const body = Buffer.alloc(32);
    fs.readSync(fd, body, 0, 32, mvhd[0]);
    const version = body[0];
    const timescale = body.readUInt32BE(version === 1 ? 20 : 12);
    const duration = version === 1 ? Number(body.readBigUInt64BE(24)) : body.readUInt32BE(16);
    if (!timescale || !duration) return null;
    return duration / timescale;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
