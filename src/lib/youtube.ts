/**
 * YouTube transcript retrieval.
 *
 * Three sources of truth, in decreasing order of reliability:
 *
 * 1. The Data API (YOUTUBE_API_KEY) — authoritative metadata and a definitive
 *    list of caption tracks. It cannot return caption *text*: captions.download
 *    rejects API keys and requires OAuth as the video's owner.
 * 2. The public timedtext endpoint — returns real transcripts, but is gated
 *    behind a proof-of-origin token and answers 200 with an empty body when one
 *    is missing, which is what happens on most corporate/datacenter networks.
 * 3. oEmbed — title and author only, but works almost anywhere.
 */

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeBlockedError extends Error {}

export type YouTubeResult = {
  videoId: string;
  title: string;
  author?: string;
  text: string;
  /** "youtube" when real captions were retrieved, otherwise description only. */
  kind: "youtube" | "youtube-description";
  warning?: string;
};

export function parseVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "music.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function isYouTubeUrl(input: string): boolean {
  return parseVideoId(input) !== null && /youtu\.?be/i.test(input);
}

const apiKey = () => process.env.YOUTUBE_API_KEY?.trim();
const hasCookie = () => Boolean(process.env.YOUTUBE_COOKIE?.trim());

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "user-agent": WEB_UA,
    "accept-language": "en-US,en;q=0.9",
  };
  const cookie = process.env.YOUTUBE_COOKIE?.trim();
  if (cookie) h.cookie = cookie;
  return h;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

type Meta = {
  title: string;
  author?: string;
  description?: string;
  duration?: string;
  hasCaptions?: boolean;
};

/** ISO 8601 duration (PT18M40S) into something a reader can scan. */
function prettyDuration(iso?: string): string | undefined {
  if (!iso) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return undefined;
  const [h, min, s] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  return h
    ? `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${min}:${String(s).padStart(2, "0")}`;
}

/** Data API metadata — 1 quota unit, and far richer than oEmbed. */
async function metaFromApi(videoId: string): Promise<Meta | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `${API}/videos?part=snippet,contentDetails&id=${videoId}&key=${key}`
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      items?: {
        snippet: { title: string; channelTitle: string; description: string };
        contentDetails: { duration: string; caption: string };
      }[];
    };
    const it = j.items?.[0];
    if (!it) return null;
    return {
      title: it.snippet.title,
      author: it.snippet.channelTitle,
      description: it.snippet.description,
      duration: prettyDuration(it.contentDetails.duration),
      hasCaptions: it.contentDetails.caption === "true",
    };
  } catch {
    return null;
  }
}

async function metaFromOEmbed(videoId: string): Promise<Meta> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: headers() }
    );
    if (res.ok) {
      const j = (await res.json()) as { title?: string; author_name?: string };
      return { title: j.title ?? `YouTube ${videoId}`, author: j.author_name };
    }
  } catch {
    /* fall through */
  }
  return { title: `YouTube ${videoId}` };
}

/** Caption track languages, for diagnostics only. Costs 50 quota units. */
async function listCaptionLanguages(videoId: string): Promise<string[] | null> {
  const key = apiKey();
  if (!key) return null;
  try {
    const res = await fetch(`${API}/captions?part=snippet&videoId=${videoId}&key=${key}`);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      items?: { snippet: { language: string; trackKind: string } }[];
    };
    return [
      ...new Set(
        (j.items ?? []).map(
          (i) => i.snippet.language + (i.snippet.trackKind === "asr" ? " (auto)" : "")
        )
      ),
    ];
  } catch {
    return null;
  }
}

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const preferred = process.env.YOUTUBE_CAPTION_LANG || "en";
  return (
    tracks.find((t) => t.languageCode === preferred && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === preferred) ??
    tracks.find((t) => t.languageCode?.startsWith(preferred.slice(0, 2))) ??
    tracks[0]
  );
}

async function tracksFromWatchPage(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: headers(),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const m = /"captionTracks":(\[.*?\])/.exec(html);
  if (!m) return [];
  try {
    return JSON.parse(m[1].replace(/\\u0026/g, "&")) as CaptionTrack[];
  } catch {
    return [];
  }
}

async function tracksFromInnertube(videoId: string): Promise<CaptionTrack[]> {
  const res = await fetch(
    "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
    {
      method: "POST",
      headers: {
        ...headers(),
        "content-type": "application/json",
        origin: "https://www.youtube.com",
        referer: `https://www.youtube.com/watch?v=${videoId}`,
        "x-youtube-client-name": "1",
        "x-youtube-client-version": "2.20250310.01.00",
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20250310.01.00",
            hl: "en",
            gl: "US",
          },
        },
        contentCheckOk: true,
        racyCheckOk: true,
      }),
    }
  );
  if (!res.ok) return [];
  const j = (await res.json()) as {
    playabilityStatus?: { status?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };
  const status = j.playabilityStatus?.status;
  if (status === "LOGIN_REQUIRED" || status === "AGE_VERIFICATION_REQUIRED") {
    throw new YouTubeBlockedError("sign-in required");
  }
  return j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

async function fetchCueText(track: CaptionTrack, videoId: string): Promise<string> {
  const url = track.baseUrl.includes("fmt=")
    ? track.baseUrl
    : `${track.baseUrl}&fmt=json3`;
  const res = await fetch(url, {
    headers: { ...headers(), referer: `https://www.youtube.com/watch?v=${videoId}` },
  });
  if (!res.ok) throw new YouTubeBlockedError(`timedtext returned ${res.status}`);
  const body = await res.text();

  // The endpoint answers 200 with an empty body when the proof-of-origin token
  // is missing, so an empty response means refused, not "no captions".
  if (!body.trim()) throw new YouTubeBlockedError("empty caption response");

  if (body.trimStart().startsWith("{")) {
    const j = JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] };
    return (j.events ?? [])
      .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
      .join(" ");
  }
  return [...body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decodeEntities(m[1]))
    .join(" ");
}

/** Turn a run-on caption stream into readable paragraphs. */
function tidy(raw: string): string {
  const text = decodeEntities(raw)
    .replace(/\[(?:music|applause|laughter|♪+)\]/gi, " ")
    .replace(/♪/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
  const paragraphs: string[] = [];
  let buf = "";
  for (const s of sentences) {
    buf += (buf ? " " : "") + s.trim();
    if (buf.length > 700) {
      paragraphs.push(buf);
      buf = "";
    }
  }
  if (buf) paragraphs.push(buf);
  return paragraphs.join("\n\n");
}

/** Descriptions carry real content, but also bare link dumps. */
function tidyDescription(desc: string): string {
  return desc
    .split(/\r?\n/)
    .filter((line) => !/^https?:\/\/\S+$/.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function header(meta: Meta, videoId: string): string {
  const bits = [meta.title];
  if (meta.author) bits.push(`by ${meta.author}`);
  if (meta.duration) bits.push(`duration ${meta.duration}`);
  bits.push(`https://www.youtube.com/watch?v=${videoId}`);
  return bits.join("\n") + "\n\n";
}

async function blockedMessage(videoId: string, meta: Meta): Promise<string> {
  const langs = await listCaptionLanguages(videoId);
  const availability = langs?.length
    ? `The Data API confirms ${langs.length} caption track${
        langs.length === 1 ? "" : "s"
      } (${langs.slice(0, 6).join(", ")}), so the captions exist — YouTube simply will not release the text. `
    : meta.hasCaptions
      ? "The Data API reports this video has captions, but will not release their text. "
      : "";

  return (
    `YouTube would not return the transcript for "${meta.title}". ${availability}` +
    `Its public transcript endpoint is gated behind a proof-of-origin token, and the ` +
    `official captions.download endpoint rejects API keys — it requires OAuth as the ` +
    `video's owner. ` +
    (hasCookie()
      ? "YOUTUBE_COOKIE is set but was not accepted; the session may have expired."
      : 'Set YOUTUBE_COOKIE to the Cookie header from a signed-in youtube.com session, or use "Paste" to add the transcript as a text source.')
  );
}

export async function fetchYouTubeTranscript(input: string): Promise<YouTubeResult> {
  const videoId = parseVideoId(input);
  if (!videoId) throw new Error("That does not look like a YouTube video URL.");

  const apiMeta = await metaFromApi(videoId);
  if (apiKey() && !apiMeta) {
    throw new Error(
      `YouTube has no video with id "${videoId}" (or the API key was rejected). Check the link.`
    );
  }
  const meta: Meta = apiMeta ?? (await metaFromOEmbed(videoId));

  let tracks: CaptionTrack[] = [];
  try {
    tracks = await tracksFromWatchPage(videoId);
  } catch {
    /* try next strategy */
  }
  if (!tracks.length) {
    try {
      tracks = await tracksFromInnertube(videoId);
    } catch {
      /* blocked — handled below */
    }
  }

  const track = pickTrack(tracks);
  if (track?.baseUrl) {
    try {
      const text = tidy(await fetchCueText(track, videoId));
      if (text) {
        return {
          videoId,
          title: meta.title,
          author: meta.author,
          kind: "youtube",
          text: header(meta, videoId) + text,
        };
      }
    } catch {
      /* fall through to the description fallback */
    }
  }

  // No transcript. A description is often substantial and is genuine, citable
  // content — ingest it rather than failing outright, but never let the user
  // believe they received a transcript.
  const description = tidyDescription(meta.description ?? "");
  const note = await blockedMessage(videoId, meta);

  if (description.length >= 200) {
    return {
      videoId,
      title: `${meta.title} (description only)`,
      author: meta.author,
      kind: "youtube-description",
      text:
        header(meta, videoId) +
        "NOTE: The spoken transcript was unavailable. The following is the video's " +
        "description, not its transcript.\n\n" +
        description,
      warning: `Added the description for "${meta.title}" — not the transcript. ${note}`,
    };
  }

  throw new YouTubeBlockedError(note);
}
