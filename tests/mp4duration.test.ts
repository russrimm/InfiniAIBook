import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mp4Seconds } from "@/lib/mp4duration";

const CLIP = path.join(process.cwd(), "e2e", "fixtures", "clip.mp4");

const box = (type: string, body: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
};
const mvhd = (version: 0 | 1, timescale: number, duration: number) => {
  const b = Buffer.alloc(version === 1 ? 32 : 20);
  b[0] = version;
  if (version === 1) {
    b.writeUInt32BE(timescale, 20);
    b.writeBigUInt64BE(BigInt(duration), 24);
  } else {
    b.writeUInt32BE(timescale, 12);
    b.writeUInt32BE(duration, 16);
  }
  return box("mvhd", b);
};
const write = (bytes: Buffer) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mp4-")), "x.mp4");
  fs.writeFileSync(file, bytes);
  return file;
};
const ftyp = box("ftyp", Buffer.from("isom0000isom"));

describe("reading an MP4's length", () => {
  it("reads a real clip", () => {
    expect(mp4Seconds(CLIP)).toBeCloseTo(2, 0);
  });

  it("reads both header versions, with the movie box after the media data", () => {
    const mdat = box("mdat", Buffer.alloc(40));
    expect(mp4Seconds(write(Buffer.concat([ftyp, mdat, box("moov", mvhd(0, 1000, 4500))])))).toBeCloseTo(4.5);
    expect(mp4Seconds(write(Buffer.concat([ftyp, box("moov", mvhd(1, 600, 3600))])))).toBe(6);
  });

  it("is null for something that is not a readable MP4", () => {
    expect(mp4Seconds(path.join(os.tmpdir(), "nope.mp4"))).toBeNull();
    expect(mp4Seconds(write(Buffer.from("not a video at all, just text")))).toBeNull();
    expect(mp4Seconds(write(ftyp))).toBeNull();
    expect(mp4Seconds(write(Buffer.concat([ftyp, box("moov", mvhd(0, 0, 100))])))).toBeNull();
    expect(mp4Seconds(write(Buffer.concat([ftyp, Buffer.from([0, 0, 0, 4, 0x6d, 0x6f, 0x6f, 0x76])])))).toBeNull();
  });
});
