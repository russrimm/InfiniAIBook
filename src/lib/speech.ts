import {
  DefaultAzureCredential,
  ClientSecretCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";

const SCOPE = "https://cognitiveservices.azure.com/.default";

const region = process.env.AZURE_SPEECH_REGION;
const resourceId = process.env.AZURE_SPEECH_RESOURCE_ID;
const speechKey = process.env.AZURE_SPEECH_KEY;

/** 96 kbit/s constant-bitrate mono MP3 — 12000 bytes per second of audio. */
const OUTPUT_FORMAT = "audio-24khz-96kbitrate-mono-mp3";
const BYTES_PER_SECOND = 12000;

export const MULTITALKER_VOICE = "en-Multitalker:DragonHDLatestNeural";

export class SpeechNotConfiguredError extends Error {}

export type Turn = { speaker: "a" | "b"; text: string };

export type VoicePair = { a: string; b: string; multitalker: boolean };

export const VOICE_PRESETS: Record<string, VoicePair> = {
  // Azure's purpose-built multi-speaker voice: one request renders a whole
  // exchange, so turn-to-turn prosody actually sounds like a conversation.
  conversational: { a: "Andrew", b: "Ava", multitalker: true },
  classic: {
    a: "en-US-AndrewMultilingualNeural",
    b: "en-US-AvaMultilingualNeural",
    multitalker: false,
  },
};

function buildCredential(): TokenCredential {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (tenantId && clientId && clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return new DefaultAzureCredential(
    clientId ? { managedIdentityClientId: clientId } : undefined
  );
}

let tokenProvider: (() => Promise<string>) | null = null;

async function authHeader(): Promise<string> {
  if (speechKey) return "";
  if (!tokenProvider) tokenProvider = getBearerTokenProvider(buildCredential(), SCOPE);
  // Speech requires the Entra token to be paired with the resource id.
  return `Bearer aad#${resourceId}#${await tokenProvider()}`;
}

function assertConfigured() {
  if (!region) {
    throw new SpeechNotConfiguredError(
      "Audio overviews need Azure Speech. Set AZURE_SPEECH_REGION (e.g. eastus2) plus AZURE_SPEECH_RESOURCE_ID for Entra auth, or AZURE_SPEECH_KEY. See .env.example."
    );
  }
  if (!speechKey && !resourceId) {
    throw new SpeechNotConfiguredError(
      "Azure Speech with Entra requires AZURE_SPEECH_RESOURCE_ID (the full /subscriptions/.../accounts/<name> id). Alternatively set AZURE_SPEECH_KEY."
    );
  }
}

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function buildSsml(turns: Turn[], voices: VoicePair): string {
  const body = voices.multitalker
    ? `<voice name='${MULTITALKER_VOICE}'><mstts:dialog>${turns
        .map(
          (t) =>
            `<mstts:turn speaker='${t.speaker === "a" ? voices.a : voices.b}'>${escapeXml(
              t.text
            )}</mstts:turn>`
        )
        .join("")}</mstts:dialog></voice>`
    : turns
        .map(
          (t) =>
            `<voice name='${t.speaker === "a" ? voices.a : voices.b}'>${escapeXml(
              t.text
            )}</voice>`
        )
        .join("");

  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'>${body}</speak>`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function synthesize(ssml: string): Promise<Buffer> {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const headers: Record<string, string> = {
    "Content-Type": "application/ssml+xml",
    "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
    "User-Agent": "OpenNotebook",
  };
  if (speechKey) headers["Ocp-Apim-Subscription-Key"] = speechKey;
  else headers["Authorization"] = await authHeader();

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers, body: ssml });
      if (res.status === 429 || res.status >= 500) {
        const after = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 1000);
        lastError = new Error(`Speech returned ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        if (res.status === 401 || res.status === 403) {
          throw new Error(
            `Azure Speech rejected the credential (${res.status}). The identity needs the 'Cognitive Services Speech User' role on the resource. ${detail}`
          );
        }
        throw new Error(`Azure Speech failed (${res.status}): ${detail}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      // A long SSML payload can have its connection dropped mid-stream; the
      // caller keeps chunks small, but retry once more before giving up.
      if (attempt === 3) throw e;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw lastError;
}

export type SynthesisResult = {
  audio: Buffer;
  durationSec: number;
  /** Start offset in seconds for each input turn, for transcript highlighting. */
  offsets: number[];
};

/**
 * Render a dialogue to a single MP3.
 *
 * Turns are synthesised in small batches: one request per batch keeps the
 * multitalker voice's cross-turn prosody, while staying far below the payload
 * size at which the service drops the connection.
 */
export async function synthesizeDialogue(
  turns: Turn[],
  voices: VoicePair = VOICE_PRESETS.conversational,
  batchSize = 6
): Promise<SynthesisResult> {
  assertConfigured();
  if (!turns.length) throw new Error("Nothing to synthesise.");

  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let elapsed = 0;

  for (let i = 0; i < turns.length; i += batchSize) {
    const batch = turns.slice(i, i + batchSize);
    const audio = await synthesize(buildSsml(batch, voices));
    const batchSeconds = audio.length / BYTES_PER_SECOND;

    // Exact offset for the batch; within it, apportion by text length. Good
    // enough to keep the highlighted line in step with the narration.
    const totalChars = batch.reduce((n, t) => n + t.text.length, 0) || 1;
    let consumed = 0;
    for (const t of batch) {
      offsets.push(elapsed + (consumed / totalChars) * batchSeconds);
      consumed += t.text.length;
    }

    parts.push(audio);
    elapsed += batchSeconds;
  }

  return {
    audio: Buffer.concat(parts),
    durationSec: elapsed,
    offsets,
  };
}

export function describeSpeechError(e: unknown): string | null {
  if (e instanceof SpeechNotConfiguredError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/Cognitive Services Speech User|rejected the credential/i.test(msg)) return msg;
  return null;
}
