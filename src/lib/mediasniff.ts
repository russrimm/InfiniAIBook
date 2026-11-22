/**
 * What an uploaded file really is, from its first bytes.
 *
 * A file name and a declared type are whatever the sender typed. FFmpeg, which
 * mixes the music and joins the intro and outro clips, decides what a file is
 * by looking inside it, and it can open more than media: a text playlist
 * (HLS, `ffconcat`) named `track.mp3` makes it read other local files or
 * request URLs. So uploads are checked against an allow-list of containers
 * before they are stored, and a file whose contents do not match its name is
 * refused rather than guessed at.
 */

export type AudioKind = "mp3" | "aac" | "wav" | "ogg" | "flac" | "m4a";

/** The file extensions each audio container may carry. */
const AUDIO_EXTENSIONS: Record<AudioKind, readonly string[]> = {
  mp3: [".mp3"],
  aac: [".aac"],
  wav: [".wav"],
  ogg: [".ogg"],
  flac: [".flac"],
  m4a: [".m4a"],
};

const AUDIO_NAMES: Record<AudioKind, string> = {
  mp3: "MP3",
  aac: "AAC",
  wav: "WAV",
  ogg: "OGG",
  flac: "FLAC",
  m4a: "M4A",
};

/** `String.fromCharCode` over a range of bytes. */
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Brands an ISO base media file (MP4, M4A) may declare. The brand follows "ftyp". */
const MP4_BRANDS = new Set([
  "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4A ", "M4B ", "M4V ", "M4P ", "f4a ", "f4v ", "msdh", "msix",
]);

/** True for the start of an MP4 family file: a box named "ftyp" with a known brand. */
export function isMp4Header(b: Uint8Array): boolean {
  if (b.length < 12 || ascii(b, 4, 8) !== "ftyp") return false;
  return MP4_BRANDS.has(ascii(b, 8, 12));
}

/** An MPEG audio frame header: 11 sync bits, then a valid version, layer, bitrate and sample rate. */
function mpegAudioFrame(b: Uint8Array, at = 0): "mp3" | "aac" | null {
  if (b.length < at + 4 || b[at] !== 0xff || (b[at + 1]! & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1]! >> 3) & 3;
  const layer = (b[at + 1]! >> 1) & 3;
  const bitrate = (b[at + 2]! >> 4) & 15;
  const rate = (b[at + 2]! >> 2) & 3;
  if (layer === 0) {
    // ADTS, the framing AAC files use: sync 0xFFF with layer bits 00 and a valid sampling index.
    return (b[at + 1]! & 0xf6) === 0xf0 && ((b[at + 2]! >> 2) & 15) < 13 ? "aac" : null;
  }
  if (version === 1 || bitrate === 15 || bitrate === 0 || rate === 3) return null;
  return "mp3";
}

/**
 * The length of an ID3v2 tag at the start of `b`, header included, or null when
 * there is none (or its header is not valid). The size is syncsafe: seven bits per byte.
 */
export function id3Length(b: Uint8Array): number | null {
  if (b.length < 10 || ascii(b, 0, 3) !== "ID3" || b[3]! < 2 || b[3]! > 4 || b[4] === 0xff) return null;
  if ((b[6]! | b[7]! | b[8]! | b[9]!) & 0x80) return null;
  return 10 + ((b[6]! << 21) | (b[7]! << 14) | (b[8]! << 7) | b[9]!);
}

/** The audio container a file starts as, or null when it is not one of the supported formats. */
export function sniffAudio(bytes: Uint8Array): AudioKind | null {
  const b = bytes.subarray(0, 4096);
  if (b.length < 4) return null;
  const head4 = ascii(b, 0, 4);

  if (head4 === "RIFF" && ascii(b, 8, 12) === "WAVE") return "wav";
  if (head4 === "OggS") return "ogg";
  if (head4 === "fLaC") return "flac";
  if (isMp4Header(b)) return "m4a";

  if (ascii(b, 0, 3) === "ID3") {
    // FFmpeg skips an ID3 tag when it probes what follows, so what follows must
    // be audio too, after any zero padding. FLAC files from older taggers carry one as well.
    const tag = id3Length(b);
    if (tag === null) return null;
    let at = tag;
    while (at < bytes.length && bytes[at] === 0) at++;
    if (ascii(bytes, at, at + 4) === "fLaC") return "flac";
    return mpegAudioFrame(bytes, at);
  }
  return mpegAudioFrame(b);
}

/**
 * Check an audio upload against its name. Returns an actionable message when
 * the contents are not supported audio, or are a different format from the
 * extension says, and null when the file is fine.
 */
export function audioUploadProblem(name: string, bytes: Uint8Array, allowed: readonly string[]): string | null {
  const ext = (/\.[^.\\/]+$/.exec(name)?.[0] ?? "").toLowerCase();
  const kind = sniffAudio(bytes);
  if (!kind) {
    return `That file's contents are not audio this app can use. Upload a real ${allowed.join(", ")} file; a playlist, text file or renamed document is refused.`;
  }
  // An ID3 tag can sit in front of MP3 and AAC audio alike.
  const startsWithTag = bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3";
  const fits =
    AUDIO_EXTENSIONS[kind].includes(ext) ||
    (startsWithTag && (kind === "mp3" || kind === "aac") && (ext === ".mp3" || ext === ".aac"));
  if (!fits) {
    return `That file is ${AUDIO_NAMES[kind]} audio, but its name ends in ${ext || "no extension"}. Rename it to .${AUDIO_EXTENSIONS[kind][0]!.slice(1)} or export it again in the format its name says.`;
  }
  return null;
}

export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "bmp";

const IMAGE_MIME: Record<ImageKind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** The image format a file starts as, with its MIME type, or null. */
export function sniffImage(bytes: Uint8Array): { kind: ImageKind; mime: string } | null {
  const b = bytes.subarray(0, 32);
  let kind: ImageKind | null = null;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    kind = "png";
  } else if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    kind = "jpeg";
  } else if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") {
    kind = "webp";
  } else if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) {
    kind = "gif";
  } else if (b.length >= 14 && ascii(b, 0, 2) === "BM" && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0) {
    kind = "bmp";
  }
  return kind ? { kind, mime: IMAGE_MIME[kind] } : null;
}
