import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { audioUploadProblem, id3Length, isMp4Header, sniffAudio, sniffImage } from "@/lib/mediasniff";
import { MUSIC_EXTENSIONS } from "@/lib/musicchoice";
import { listTracks, resolveMusic, saveUpload } from "@/lib/music";

const bytes = (...parts: (number[] | string | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : [...p])));

const MP3_FRAME = [0xff, 0xfb, 0x90, 0x00];
const ADTS_FRAME = [0xff, 0xf1, 0x50, 0x80];
const pad = (n: number) => new Array<number>(n).fill(0);
const id3 = (size: number) => bytes("ID3", [3, 0, 0], [(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127], pad(size));

const SAMPLES = {
  mp3: bytes(MP3_FRAME, pad(64)),
  mp3WithTag: bytes(id3(300), MP3_FRAME, pad(64)),
  aac: bytes(ADTS_FRAME, pad(64)),
  wav: bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt ", pad(32)),
  ogg: bytes("OggS", [0, 2], pad(32)),
  flac: bytes("fLaC", pad(32)),
  m4a: bytes([0, 0, 0, 0x20], "ftypM4A ", pad(32)),
};

describe("sniffAudio", () => {
  it("recognizes each supported container from its first bytes", () => {
    expect(sniffAudio(SAMPLES.mp3)).toBe("mp3");
    expect(sniffAudio(SAMPLES.mp3WithTag)).toBe("mp3");
    expect(sniffAudio(SAMPLES.aac)).toBe("aac");
    expect(sniffAudio(SAMPLES.wav)).toBe("wav");
    expect(sniffAudio(SAMPLES.ogg)).toBe("ogg");
    expect(sniffAudio(SAMPLES.flac)).toBe("flac");
    expect(sniffAudio(SAMPLES.m4a)).toBe("m4a");
  });

  it("refuses the text files FFmpeg would read as playlists, and other non-audio", () => {
    const playlists = [
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nhttp://169.254.169.254/latest/meta-data/\n",
      "ffconcat version 1.0\nfile '/etc/passwd'\n",
      "#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n",
      "<?xml version=\"1.0\"?><MPD></MPD>",
      "MZ\x90\x00 not audio",
      "<html><script>alert(1)</script></html>",
      "",
      "ID3",
    ];
    for (const text of playlists) expect(sniffAudio(bytes(text)), text).toBeNull();
  });

  it("refuses a playlist hidden behind an ID3 tag, which FFmpeg skips when it probes", () => {
    const hidden = bytes(id3(100), "#EXTM3U\n#EXTINF:1,\nhttp://127.0.0.1/\n");
    expect(sniffAudio(hidden)).toBeNull();
  });

  it("refuses a frame header with invalid fields", () => {
    expect(sniffAudio(bytes([0xff, 0xe1, 0x90, 0x00]))).toBeNull(); // reserved MPEG version
    expect(sniffAudio(bytes([0xff, 0xfb, 0xf0, 0x00]))).toBeNull(); // bitrate index 15
    expect(sniffAudio(bytes([0xff, 0xfb, 0x9c, 0x00]))).toBeNull(); // sample rate index 3
    expect(sniffAudio(bytes([0xff, 0xfb, 0x00, 0x00]))).toBeNull(); // free-format bitrate
  });

  it("reads the size of an ID3 tag", () => {
    expect(id3Length(id3(300))).toBe(310);
    expect(id3Length(bytes("ID3", [9, 0, 0], [0, 0, 0, 1]))).toBeNull();
    expect(id3Length(bytes(MP3_FRAME))).toBeNull();
  });
});

describe("audioUploadProblem", () => {
  const allowed = MUSIC_EXTENSIONS;

  it("accepts audio that matches its extension", () => {
    expect(audioUploadProblem("a.mp3", SAMPLES.mp3, allowed)).toBeNull();
    expect(audioUploadProblem("a.MP3", SAMPLES.mp3WithTag, allowed)).toBeNull();
    expect(audioUploadProblem("a.aac", SAMPLES.aac, allowed)).toBeNull();
    expect(audioUploadProblem("a.aac", bytes(id3(20), ADTS_FRAME, pad(16)), allowed)).toBeNull();
    expect(audioUploadProblem("a.wav", SAMPLES.wav, allowed)).toBeNull();
    expect(audioUploadProblem("a.ogg", SAMPLES.ogg, allowed)).toBeNull();
    expect(audioUploadProblem("a.flac", SAMPLES.flac, allowed)).toBeNull();
    expect(audioUploadProblem("a.m4a", SAMPLES.m4a, allowed)).toBeNull();
  });

  it("names both formats when the extension and the contents disagree", () => {
    expect(audioUploadProblem("a.wav", SAMPLES.mp3, allowed)).toMatch(/is MP3 audio, but its name ends in \.wav.*\.mp3/);
    expect(audioUploadProblem("a.mp3", SAMPLES.flac, allowed)).toMatch(/is FLAC audio, but its name ends in \.mp3/);
  });

  it("explains that a playlist or other file is not accepted", () => {
    const problem = audioUploadProblem("track.mp3", bytes("#EXTM3U\nhttp://127.0.0.1/\n"), allowed);
    expect(problem).toMatch(/not audio this app can use/);
    expect(problem).toMatch(/playlist/);
  });
});

describe("sniffImage and isMp4Header", () => {
  it("recognizes PNG, JPEG, WebP, GIF and BMP", () => {
    expect(sniffImage(bytes([0x89], "PNG\r\n", [0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))?.mime).toBe("image/jpeg");
    expect(sniffImage(bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffImage(bytes("GIF89a", pad(8)))?.mime).toBe("image/gif");
    expect(sniffImage(bytes("BM", [0, 0, 0, 0], pad(10)))?.mime).toBe("image/bmp");
  });

  it("refuses text, SVG and a WAV that claims to be an image", () => {
    for (const body of ["<svg xmlns='http://www.w3.org/2000/svg'/>", "#EXTM3U\n", "GIF", "not an image at all"]) {
      expect(sniffImage(bytes(body)), body).toBeNull();
    }
    expect(sniffImage(SAMPLES.wav)).toBeNull();
  });

  it("accepts MP4 family brands only", () => {
    expect(isMp4Header(bytes([0, 0, 0, 0x18], "ftypisom", pad(8)))).toBe(true);
    expect(isMp4Header(bytes([0, 0, 0, 0x18], "ftypmp42", pad(8)))).toBe(true);
    expect(isMp4Header(bytes([0, 0, 0, 0x18], "ftypXXXX", pad(8)))).toBe(false);
    expect(isMp4Header(bytes("#EXTM3U\n#EXTINF"))).toBe(false);
  });
});

describe("the music library", () => {
  const made: string[] = [];
  afterEach(() => {
    while (made.length) fs.rmSync(made.pop()!, { force: true, recursive: true });
    delete process.env.MOTION_MUSIC_DIR;
  });

  it("stores real audio and refuses a playlist or a mislabeled file with a message", () => {
    const track = saveUpload("Theme.mp3", SAMPLES.mp3WithTag);
    expect(track.name).toBe("Theme");
    made.push(path.join(process.env.DATA_DIR!, "music"));

    expect(() => saveUpload("evil.mp3", bytes("#EXTM3U\n#EXTINF:1,\nhttp://169.254.169.254/\n"))).toThrow(/not audio this app can use/);
    expect(() => saveUpload("ffconcat.wav", bytes("ffconcat version 1.0\nfile '/etc/passwd'\n"))).toThrow(/playlist/);
    expect(() => saveUpload("song.mp3", SAMPLES.wav)).toThrow(/is WAV audio, but its name ends in \.mp3/);
    expect(() => saveUpload("empty.mp3", new Uint8Array())).toThrow(/empty/);
  });

  it("does not hand a file that is not audio to the mixer, even if it got into the folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "music-folder-"));
    made.push(dir);
    fs.writeFileSync(path.join(dir, "Good.mp3"), SAMPLES.mp3WithTag);
    fs.writeFileSync(path.join(dir, "Bad.mp3"), "#EXTM3U\n#EXTINF:1,\nhttp://127.0.0.1/\n");
    process.env.MOTION_MUSIC_DIR = dir;
    const resolveNamed = (name: string) => {
      const track = listTracks().find((t) => t.name === name);
      return track ? resolveMusic({ track: track.id, volume: "medium" }) : undefined;
    };
    expect(resolveNamed("Good")).toMatchObject({ name: "Good" });
    expect(resolveNamed("Bad")).toBeNull();
  });
});
