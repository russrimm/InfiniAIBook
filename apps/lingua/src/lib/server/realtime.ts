/**
 * Starting a realtime call.
 *
 * The browser sends its SDP offer here. The server mints a short-lived client
 * secret for the configured session and posts the offer to the provider with
 * it, returning the SDP answer. The secret never reaches the browser.
 */
import type { ResolvedSetup } from "../setup";
import { buildSessionConfig } from "../realtimeConfig";
import {
  ProviderError,
  authHeaders,
  describeProviderError,
  provider,
  realtimeModel,
  transcriptionModel,
} from "./provider";

const TIMEOUT_MS = 20_000;

async function post(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export async function mintClientSecret(s: ResolvedSetup): Promise<string> {
  const { baseUrl } = provider();
  const session = buildSessionConfig(s, {
    model: realtimeModel(),
    transcriptionModel: transcriptionModel(),
  });
  const res = await post(`${baseUrl}/realtime/client_secrets`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ session }),
  });
  if (!res.ok) {
    throw new ProviderError(res.status, describeProviderError(res.status, await res.text()));
  }
  const data = (await res.json()) as { value?: string; client_secret?: { value?: string } };
  const value = data.value ?? data.client_secret?.value;
  if (!value) throw new ProviderError(502, "The provider returned no client secret.");
  return value;
}

export async function negotiateCall(secret: string, offerSdp: string): Promise<string> {
  const { baseUrl } = provider();
  const res = await post(`${baseUrl}/realtime/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/sdp" },
    body: offerSdp,
  });
  if (!res.ok) {
    throw new ProviderError(res.status, describeProviderError(res.status, await res.text()));
  }
  const answer = await res.text();
  if (!answer.startsWith("v=")) throw new ProviderError(502, "The provider returned an invalid SDP answer.");
  return answer;
}

export async function startCall(s: ResolvedSetup, offerSdp: string): Promise<string> {
  const secret = await mintClientSecret(s);
  return negotiateCall(secret, offerSdp);
}
