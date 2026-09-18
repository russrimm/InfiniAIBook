import { AzureOpenAI } from "openai";
import {
  DefaultAzureCredential,
  ClientSecretCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const SCOPE = "https://cognitiveservices.azure.com/.default";

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
  if (apiKey) return null;
  const msg = e instanceof Error ? e.message : String(e);
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

export async function chatText(messages: ChatMsg[], temperature = 0.3): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: CHAT_DEPLOYMENT,
    temperature,
    messages,
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

export async function chatStream(messages: ChatMsg[], temperature = 0.3) {
  return getClient().chat.completions.create({
    model: CHAT_DEPLOYMENT,
    temperature,
    stream: true,
    messages,
  });
}

/** Ask the model for a JSON object and parse it defensively. */
export async function chatJSON<T>(messages: ChatMsg[], temperature = 0.4): Promise<T> {
  const res = await getClient().chat.completions.create({
    model: CHAT_DEPLOYMENT,
    temperature,
    response_format: { type: "json_object" },
    messages,
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
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
