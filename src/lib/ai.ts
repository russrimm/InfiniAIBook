import { AzureOpenAI } from "openai";
import {
  DefaultAzureCredential,
  ClientSecretCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const DEFAULT_API_VERSION = "2024-10-21";
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || DEFAULT_API_VERSION;
const SCOPE = "https://cognitiveservices.azure.com/.default";

/**
 * Azure data-plane API versions are dated releases, not model versions. Picking
 * a model version (e.g. gpt-5's "2025-08-07") yields a confusing 404 on every
 * call, so flag anything that isn't a published release.
 */
const KNOWN_API_VERSIONS = new Set([
  "2023-05-15",
  "2024-02-01",
  "2024-06-01",
  "2024-08-01-preview",
  "2024-10-21",
  "2024-12-01-preview",
  "2025-01-01-preview",
  "2025-03-01-preview",
  "2025-04-01-preview",
]);

const apiVersionLooksWrong =
  !KNOWN_API_VERSIONS.has(apiVersion) && !/-preview$/.test(apiVersion);

export const CHAT_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
export const EMBED_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";

export class MissingConfigError extends Error {}

function buildCredential(): TokenCredential {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  // Explicit service principal, when one is supplied (CI, containers).
  if (tenantId && clientId && clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  // Otherwise walk the standard chain: env vars, workload identity, managed
  // identity, then the developer's `az login` / VS Code / Azure PowerShell session.
  return new DefaultAzureCredential(
    clientId ? { managedIdentityClientId: clientId } : undefined
  );
}

let client: AzureOpenAI | null = null;

export function getClient(): AzureOpenAI {
  if (!endpoint) {
    throw new MissingConfigError(
      "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT in .env.local (see .env.example)."
    );
  }
  if (client) return client;

  if (apiKey) {
    client = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  } else {
    // Entra ID. The provider is called per request and handles token caching
    // and refresh, so long-running processes never serve an expired token.
    const azureADTokenProvider = getBearerTokenProvider(buildCredential(), SCOPE);
    client = new AzureOpenAI({ endpoint, azureADTokenProvider, apiVersion });
  }
  return client;
}

/** Surface Entra failures as actionable setup guidance rather than a raw 401. */
export function describeAuthError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;

  // A 404 here almost always means a misconfigured api-version or a deployment
  // name that does not exist, not a missing resource.
  if (status === 404) {
    const hint = apiVersionLooksWrong
      ? `AZURE_OPENAI_API_VERSION is set to "${apiVersion}", which is not an Azure API version — model versions like "2025-08-07" are not valid here. Use "${DEFAULT_API_VERSION}".`
      : `Check that the deployment names AZURE_OPENAI_DEPLOYMENT ("${CHAT_DEPLOYMENT}") and AZURE_OPENAI_EMBEDDING_DEPLOYMENT ("${EMBED_DEPLOYMENT}") exist on ${endpoint}.`;
    return `Azure OpenAI returned 404. ${hint}`;
  }

  if (apiKey) return null;

  const isAuth =
    /CredentialUnavailable|AuthenticationRequired|DefaultAzureCredential|AADSTS|managed identity/i.test(
      msg
    );
  const isDenied = /\b401\b|\b403\b|PermissionDenied|Unauthorized|Forbidden/i.test(msg);

  if (isAuth) {
    return `No Microsoft Entra credential was available. Run 'az login' (or set AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET) and restart the server. Details: ${msg}`;
  }
  if (isDenied) {
    return `Entra sign-in succeeded but the identity was denied. Assign it the 'Cognitive Services OpenAI User' role on the Azure OpenAI resource. Details: ${msg}`;
  }
  return null;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type ChatParams = Parameters<AzureOpenAI["chat"]["completions"]["create"]>[0];

/**
 * Reasoning deployments (gpt-5, o-series) reject a custom `temperature` and
 * accept only the default. We can't infer that from the deployment name, which
 * is user-chosen, so probe once and remember the answer for the process.
 */
let supportsTemperature: boolean | null = null;

function isTemperatureRejection(e: unknown): boolean {
  const err = e as { param?: string; code?: string; message?: string };
  const msg = err?.message ?? String(e);
  return (
    err?.param === "temperature" ||
    /'temperature' does not support|temperature.*not supported/i.test(msg)
  );
}

/** Run a chat call, retrying without `temperature` if the model refuses it. */
async function createChat(params: ChatParams & { temperature?: number }) {
  const client = getClient();
  if (supportsTemperature === false) {
    const { temperature: _omit, ...rest } = params;
    return client.chat.completions.create(rest as ChatParams);
  }
  try {
    const res = await client.chat.completions.create(params as ChatParams);
    if (supportsTemperature === null) supportsTemperature = true;
    return res;
  } catch (e) {
    if (!isTemperatureRejection(e)) throw e;
    supportsTemperature = false;
    const { temperature: _omit, ...rest } = params;
    return client.chat.completions.create(rest as ChatParams);
  }
}

export async function chatText(messages: ChatMsg[], temperature = 0.3): Promise<string> {
  const res = await createChat({ model: CHAT_DEPLOYMENT, temperature, messages });
  return (
    (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ??
    ""
  );
}

export async function chatStream(messages: ChatMsg[], temperature = 0.3) {
  const res = await createChat({
    model: CHAT_DEPLOYMENT,
    temperature,
    stream: true,
    messages,
  });
  return res as AsyncIterable<{
    choices?: { delta?: { content?: string | null } }[];
  }>;
}

/** Ask the model for a JSON object and parse it defensively. */
export async function chatJSON<T>(messages: ChatMsg[], temperature = 0.4): Promise<T> {
  const res = await createChat({
    model: CHAT_DEPLOYMENT,
    temperature,
    response_format: { type: "json_object" },
    messages,
  });
  const raw =
    (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ??
    "";
  return parseJSON<T>(raw);
}

export function parseJSON<T>(raw: string): T {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T;
    }
    throw new Error("Model did not return valid JSON.");
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000) || " ");
    const res = await getClient().embeddings.create({
      model: EMBED_DEPLOYMENT,
      input: slice,
    });
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}
