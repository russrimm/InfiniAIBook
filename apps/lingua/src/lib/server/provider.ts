/**
 * Server-only access to the model provider: Azure OpenAI with Microsoft Entra
 * ID (or a key), or OpenAI directly. Never import from client components.
 */
import {
  ClientSecretCredential,
  DefaultAzureCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";

export class NotConfiguredError extends Error {}

const DEFAULT_SCOPE = "https://cognitiveservices.azure.com/.default";
const DEFAULT_TRANSCRIPTION = "gpt-4o-mini-transcribe";

export type Provider = {
  kind: "azure" | "openai";
  /** Base URL of the v1 API, without a trailing slash. */
  baseUrl: string;
  /** Base URL for realtime calls, which Azure serves only on the openai.azure.com host. */
  realtimeBaseUrl: string;
};

/**
 * Foundry (AIServices) resources answer on several hosts, but list the
 * realtime API only under <name>.openai.azure.com. Map the other two there so
 * the endpoint copied from the Foundry portal works as is.
 */
export function azureRealtimeOrigin(origin: string): string {
  const m = origin.match(/^https:\/\/([a-z0-9-]+)\.(?:services\.ai|cognitiveservices)\.azure\.com$/i);
  return m ? `https://${m[1]}.openai.azure.com` : origin;
}

export function provider(): Provider {
  const azure = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  if (azure) {
    let url: URL;
    try {
      url = new URL(azure);
    } catch {
      throw new NotConfiguredError(`AZURE_OPENAI_ENDPOINT is not a valid URL: "${azure}".`);
    }
    if (url.protocol !== "https:") {
      throw new NotConfiguredError("AZURE_OPENAI_ENDPOINT must use https.");
    }
    return {
      kind: "azure",
      baseUrl: `${url.origin}/openai/v1`,
      realtimeBaseUrl: `${azureRealtimeOrigin(url.origin)}/openai/v1`,
    };
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return { kind: "openai", baseUrl: "https://api.openai.com/v1", realtimeBaseUrl: "https://api.openai.com/v1" };
  }
  throw new NotConfiguredError(
    "No model provider configured. Set AZURE_OPENAI_ENDPOINT (Entra ID or AZURE_OPENAI_API_KEY) or OPENAI_API_KEY. See .env.example."
  );
}

export function realtimeModel(): string {
  const m = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim();
  if (!m) {
    throw new NotConfiguredError(
      "Set AZURE_OPENAI_REALTIME_DEPLOYMENT to your realtime model deployment (for example gpt-realtime)."
    );
  }
  return m;
}

export function transcriptionModel(): string | null {
  const m = process.env.AZURE_OPENAI_TRANSCRIPTION_MODEL?.trim();
  if (m && /^(off|none|false)$/i.test(m)) return null;
  return m || DEFAULT_TRANSCRIPTION;
}

/** Chat model for translations and recaps; null when not configured. */
export function chatModel(): string | null {
  return process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || null;
}

function buildCredential(): TokenCredential {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (tenantId && clientId && clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }
  return new DefaultAzureCredential(clientId ? { managedIdentityClientId: clientId } : undefined);
}

let tokenProvider: (() => Promise<string>) | null = null;

/** Authorization headers for a server-to-provider call. */
export async function authHeaders(): Promise<Record<string, string>> {
  const p = provider();
  if (p.kind === "openai") {
    return { Authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}` };
  }
  const key = process.env.AZURE_OPENAI_API_KEY?.trim();
  if (key) return { "api-key": key };
  if (!tokenProvider) {
    tokenProvider = getBearerTokenProvider(
      buildCredential(),
      process.env.AZURE_OPENAI_TOKEN_SCOPE?.trim() || DEFAULT_SCOPE
    );
  }
  return { Authorization: `Bearer ${await tokenProvider()}` };
}

/** Turn a provider failure into a message a person can act on. */
export function describeProviderError(status: number, body: string): string {
  const detail = body.slice(0, 400);
  if (status === 401 || status === 403) {
    return `The model provider rejected the credential (${status}). With Entra ID, the identity needs the "Cognitive Services OpenAI User" role on the resource. ${detail}`;
  }
  if (status === 404) {
    return `The model provider returned 404. Check that the deployment name exists and the resource is in a region that offers realtime models. ${detail}`;
  }
  if (status === 400 && /OpperationNotSupported|OperationNotSupported|does not work with the specified model/i.test(body)) {
    const name = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT?.trim() ?? "";
    return `There is no realtime model deployment named "${name}" on this resource. Deploy a realtime model (for example gpt-realtime-2.1) in Microsoft Foundry and set AZURE_OPENAI_REALTIME_DEPLOYMENT to its deployment name.`;
  }
  if (status === 429) return `The model is rate-limited (429). Wait a moment and try again. ${detail}`;
  return `The model provider returned ${status}. ${detail}`;
}

export class ProviderError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
