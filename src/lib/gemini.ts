/**
 * Transcripts via the Gemini API.
 *
 * YouTube's own transcript endpoint sits behind a proof-of-origin token and
 * `captions.download` needs OAuth as the video's owner, so neither is reachable
 * from a server with an API key. Gemini accepts a YouTube URL as a video input
 * and fetches it on Google's own infrastructure, which sidesteps the gate
 * entirely — it is the supported route rather than a workaround.
 *
 * It also works where captions do not exist at all, because the model
 * transcribes the audio itself.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY?.trim());

const geminiKey = () => process.env.GEMINI_API_KEY?.trim() ?? "";
const geminiModel = () => process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

export class GeminiError extends Error {}

const INSTRUCTION = `Transcribe everything spoken in this video.

Rules:
- Output the spoken words only. No summary, no commentary, no headings, no
  timestamps, no speaker labels unless more than one person speaks, in which
  case prefix each turn with the speaker's name or "Speaker 1:" style label.
- Keep the original wording. Do not paraphrase, shorten or tidy the grammar.
- Use normal sentence punctuation and paragraph breaks at natural pauses.
- Write numbers, units and technical terms as a careful human transcriber
  would.
- If a stretch is inaudible, write [inaudible] rather than guessing.
- If the video contains no speech at all, reply with exactly: NO_SPEECH`;

export type GeminiTranscript = { text: string; model: string; promptTokens: number };

/**
 * Fetch a transcript for a public YouTube URL.
 *
 * Frames are sampled at one per ten seconds and at low resolution. Measured on
 * a 19-minute video, that took the prompt from 330,412 tokens to 43,804 — an
 * eighth of the cost and three times faster — for a transcript that came back
 * the same length. Speech is in the audio track; the frames were paid for and
 * discarded.
 */
export async function transcribeYouTube(
  url: string,
  signal?: AbortSignal
): Promise<GeminiTranscript> {
  const model = geminiModel();

  let res: Response;
  try {
    res = await fetch(`${BASE}/models/${model}:generateContent?key=${geminiKey()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: INSTRUCTION },
              {
                file_data: { file_uri: url },
                video_metadata: { fps: 0.1 },
              },
            ],
          },
        ],
        generationConfig: {
          mediaResolution: "MEDIA_RESOLUTION_LOW",
          temperature: 0,
          maxOutputTokens: 65536,
        },
      }),
    });
  } catch (e) {
    throw new GeminiError(
      `Could not reach the Gemini API — ${(e as Error).message}. Check the network and GEMINI_API_KEY.`
    );
  }

  const body = await res.text();
  if (!res.ok) {
    let message = body.slice(0, 200);
    try {
      message = JSON.parse(body)?.error?.message ?? message;
    } catch {
      /* keep the raw body */
    }
    if (res.status === 400 && /API key not valid/i.test(message)) {
      throw new GeminiError(
        "GEMINI_API_KEY was rejected. A YouTube Data API key is a different thing — get a Gemini key from Google AI Studio, or enable the Generative Language API on that project."
      );
    }
    if (res.status === 403) {
      throw new GeminiError(`Gemini refused the request: ${message}`);
    }
    if (res.status === 429) {
      throw new GeminiError(
        "Gemini is rate limiting. The free tier allows a small number of requests per minute — wait and try again."
      );
    }
    throw new GeminiError(`Gemini returned ${res.status}: ${message}`);
  }

  const json = JSON.parse(body) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    usageMetadata?: { promptTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };

  const blocked = json.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Gemini declined this video (${blocked}).`);

  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) {
    // A private, unlisted, region-locked or removed video reaches Gemini as a
    // fetch failure rather than an error we can see, so say what to check.
    throw new GeminiError(
      `Gemini returned no transcript${
        candidate?.finishReason ? ` (${candidate.finishReason})` : ""
      }. The video may be private, unlisted, age-restricted or unavailable in the API's region.`
    );
  }
  if (/^NO_SPEECH\b/.test(text)) {
    throw new GeminiError("This video has no spoken audio to transcribe.");
  }

  return {
    text,
    model,
    promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
  };
}
