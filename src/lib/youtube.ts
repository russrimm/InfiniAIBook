/**
 * YouTube transcript retrieval.
 *
 * YouTube actively blocks automated caption access from datacenter and many
 * corporate networks, answering with a bot wall instead of caption data. Two
 * strategies are tried in order, and a cookie can be supplied to authenticate
 * past the wall when one is needed.
 */

const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class YouTubeBlockedError extends Error {}

export type YouTubeTranscript = {
  videoId: string;
  title: string;
  author?: string;
  text: string;
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

/** Public metadata endpoint — works even when caption access is blocked. */
async function fetchOEmbed(
  videoId: string
): Promise<{ title: string; author?: string }> {
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

/** Strategy 1: caption tracks embedded in the watch page. */
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

/** Strategy 2: the InnerTube player endpoint. */
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
    playabilityStatus?: { status?: string; reason?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] };
    };
  };

  const status = j.playabilityStatus?.status;
  if (status === "LOGIN_REQUIRED" || status === "AGE_VERIFICATION_REQUIRED") {
    throw new YouTubeBlockedError(
      j.playabilityStatus?.reason ?? "Sign-in required"
    );
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
  if (!res.ok) return "";
  const body = await res.text();

  // YouTube now gates caption data behind a proof-of-origin token. Without one
  // it answers 200 with a zero-byte body rather than an error status, so this
  // is the signal that the request was refused, not that captions are missing.
  if (!body.trim()) {
    throw new YouTubeBlockedError(
      track.baseUrl.includes("pot=")
        ? "YouTube returned an empty caption track."
        : "no proof-of-origin token"
    );
  }

  if (body.trimStart().startsWith("{")) {
    const j = JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] };
    return (j.events ?? [])
      .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
      .join(" ");
  }

  // XML fallback
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

const hasCookie = () => Boolean(process.env.YOUTUBE_COOKIE?.trim());

function blockedMessage(title: string): string {
  return (
    `YouTube refused automated caption access for "${title}" from this network. ` +
    `It accepted the request but returned no caption data — the current anti-bot ` +
    `gate on the transcript endpoint. This is a restriction on YouTube's side, not ` +
    `a problem with the video or this app. ` +
    (hasCookie()
      ? `YOUTUBE_COOKIE is set but was not accepted; the session may have expired.`
      : `Set YOUTUBE_COOKIE in .env.local to the Cookie header from a signed-in ` +
        `youtube.com session, or paste the transcript in as a text source ` +
        `("Paste" in the Sources panel).`)
  );
}

export async function fetchYouTubeTranscript(
  input: string
): Promise<YouTubeTranscript> {
  const videoId = parseVideoId(input);
  if (!videoId) throw new Error("That does not look like a YouTube video URL.");

  const meta = await fetchOEmbed(videoId);

  let tracks: CaptionTrack[] = [];
  let blocked = false;

  try {
    tracks = await tracksFromWatchPage(videoId);
  } catch {
    /* try next strategy */
  }

  if (!tracks.length) {
    try {
      tracks = await tracksFromInnertube(videoId);
    } catch (e) {
      if (e instanceof YouTubeBlockedError) blocked = true;
    }
  }

  if (!tracks.length) {
    if (blocked) throw new YouTubeBlockedError(blockedMessage(meta.title));
    throw new Error(
      `No captions are available for "${meta.title}". The video may have captions disabled, or YouTube may be withholding them from this network. You can paste the transcript in as a text source instead.`
    );
  }

  const track = pickTrack(tracks);
  if (!track?.baseUrl) throw new Error(`No usable caption track for "${meta.title}".`);

  let raw: string;
  try {
    raw = await fetchCueText(track, videoId);
  } catch (e) {
    if (e instanceof YouTubeBlockedError) throw new YouTubeBlockedError(blockedMessage(meta.title));
    throw e;
  }

  const text = tidy(raw);
  if (!text) throw new YouTubeBlockedError(blockedMessage(meta.title));

  const header = meta.author
    ? `${meta.title}\nby ${meta.author}\nhttps://www.youtube.com/watch?v=${videoId}\n\n`
    : `${meta.title}\nhttps://www.youtube.com/watch?v=${videoId}\n\n`;

  return { videoId, title: meta.title, author: meta.author, text: header + text };
}
