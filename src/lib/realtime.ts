/**
 * Realtime voice sessions for live discussions (server only).
 *
 * Works with Azure OpenAI (Entra ID or key, the same credentials as chat) and
 * with OpenAI directly. The browser never sees a credential: it sends its
 * WebRTC offer here, the server mints a short-lived client secret for the
 * configured session, exchanges the offer with it, and returns only the answer.
 */
import { PROVIDER, PROVIDER_LABEL, authHeaders } from "./ai";
import { resolveEndpoint } from "./providers";

const TIMEOUT_MS = 20_000;
const DEFAULT_TRANSCRIPTION = "gpt-4o-mini-transcribe";

export class RealtimeUnavailableError extends Error {}

export class RealtimeProviderError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Foundry (AIServices) resources answer on several hosts but serve the
 * realtime API only on <name>.openai.azure.com, so an endpoint copied from the
 * Foundry portal is mapped there.
 */
export function azureRealtimeOrigin(origin: string): string {
  const m = origin.match(/^https:\/\/([a-z0-9-]+)\.(?:services\.ai|cognitiveservices)\.azure\.com$/i);
  return m ? `https://${m[1]}.openai.azure.com` : origin;
}

export type RealtimeTarget = { baseUrl: string; model: string; transcription: string | null };

/** Where live discussions run, or why they can't. */
export function realtimeTarget(): RealtimeTarget {
  const t = process.env.AI_REALTIME_TRANSCRIPTION_MODEL?.trim();
  const transcription = t && /^(off|none|false)$/i.test(t) ? null : t || DEFAULT_TRANSCRIPTION;

  if (PROVIDER === "azure") {
    const raw = process.env.AZURE_OPENAI_ENDPOINT?.trim();
    if (!raw) throw new RealtimeUnavailableError("Set AZURE_OPENAI_ENDPOINT to use live discussions.");
    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      throw new RealtimeUnavailableError(`AZURE_OPENAI_ENDPOINT is not a valid URL: "${raw}".`);
    }
    const model = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim();
    if (!model) {
      throw new RealtimeUnavailableError(
        "Live discussions need a realtime model. Deploy one (for example gpt-realtime-2.1, in East US 2 or Sweden Central) and set AZURE_OPENAI_REALTIME_DEPLOYMENT to its deployment name."
      );
    }
    return { baseUrl: `${azureRealtimeOrigin(origin)}/openai/v1`, model, transcription };
  }

  const main = resolveEndpoint("AI");
  if (main.baseURL && /^https:\/\/api\.openai\.com\/v1\/?$/.test(main.baseURL)) {
    return {
      baseUrl: "https://api.openai.com/v1",
      model: process.env.AI_REALTIME_MODEL?.trim() || "gpt-realtime",
      transcription,
    };
  }
  throw new RealtimeUnavailableError(
    `Live discussions need a realtime voice model from Azure OpenAI or OpenAI. ${PROVIDER_LABEL} does not offer one.`
  );
}

export function describeRealtimeError(status: number, body: string): string {
  const detail = body.slice(0, 300);
  if (status === 401 || status === 403) {
    return `The realtime service rejected the credential (${status}). With Entra ID, the identity needs the "Cognitive Services OpenAI User" role on the resource. ${detail}`;
  }
  if (status === 400 && /Op+erationNotSupported|does not work with the specified model/i.test(body)) {
    const name = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim() || process.env.AI_REALTIME_MODEL?.trim() || "";
    return `The realtime model "${name}" isn't available. If you just deployed it, wait about five minutes for it to come online and try again. Otherwise check that AZURE_OPENAI_REALTIME_DEPLOYMENT names a realtime model deployment.`;
  }
  if (status === 404) {
    return `The realtime service returned 404. Check the deployment name and that the resource is in a region with realtime models. ${detail}`;
  }
  if (status === 429) return `The realtime model is rate-limited. Wait a moment and try again. ${detail}`;
  return `The realtime service returned ${status}. ${detail}`;
}

async function post(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** Start a call: mint a client secret for `session`, then exchange the SDP offer with it. */
export async function startRealtimeCall(
  session: Record<string, unknown>,
  offerSdp: string,
  target: RealtimeTarget = realtimeTarget()
): Promise<string> {
  const secretRes = await post(`${target.baseUrl}/realtime/client_secrets`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ session: { ...session, type: "realtime", model: target.model } }),
  });
  if (!secretRes.ok) {
    throw new RealtimeProviderError(secretRes.status, describeRealtimeError(secretRes.status, await secretRes.text()));
  }
  const data = (await secretRes.json()) as { value?: string; client_secret?: { value?: string } };
  const secret = data.value ?? data.client_secret?.value;
  if (!secret) throw new RealtimeProviderError(502, "The realtime service returned no client secret.");

  const callRes = await post(`${target.baseUrl}/realtime/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/sdp" },
    body: offerSdp,
  });
  if (!callRes.ok) {
    throw new RealtimeProviderError(callRes.status, describeRealtimeError(callRes.status, await callRes.text()));
  }
  const answer = await callRes.text();
  if (!answer.startsWith("v=")) throw new RealtimeProviderError(502, "The realtime service returned an invalid SDP answer.");
  return answer;
}
