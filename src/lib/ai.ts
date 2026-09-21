import OpenAI, { AzureOpenAI } from "openai";
import {
  DefaultAzureCredential,
  ClientSecretCredential,
  getBearerTokenProvider,
  type TokenCredential,
} from "@azure/identity";
import { getSetting, SETTING_CHAT_MODEL, SETTING_EMBED_MODEL, SETTING_IMAGE_MODEL, SETTING_VISION_MODEL } from "./settings";

/**
 * Two providers are supported.
 *
 * "openai"  — any OpenAI-compatible endpoint given a base URL: llama.cpp's
 *             llama-server, Ollama, LM Studio, vLLM, or OpenAI itself. Most
 *             local runtimes ignore the API key but the SDK requires one.
 * "azure"   — Azure OpenAI, with Entra ID or a key.
 *
 * AI_BASE_URL wins when both are configured, so pointing at a local runtime is
 * a one-line change that needs no Azure settings removed.
 */
const baseURL = process.env.AI_BASE_URL?.trim();
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;

export type Provider = "openai" | "azure";
export const PROVIDER: Provider = baseURL ? "openai" : "azure";

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

/**
 * Model names. For Azure these are *deployment* names; for an OpenAI-compatible
 * endpoint they are model ids.
 *
 * Resolved per call rather than captured at import, so a choice saved from the
 * UI applies immediately. Order: saved setting, then environment, then a
 * default. AI_MODEL / AI_EMBEDDING_MODEL are kept separate from the Azure
 * deployment names so neither provider's config leaks into the other.
 */
export function chatModel(): string {
  return (
    getSetting(SETTING_CHAT_MODEL) ||
    process.env.AI_MODEL?.trim() ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    "gpt-4o"
  );
}

export function embedModel(): string {
  return (
    getSetting(SETTING_EMBED_MODEL) ||
    process.env.AI_EMBEDDING_MODEL?.trim() ||
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ||
    "text-embedding-3-small"
  );
}

/** The value configured in the environment, ignoring any saved override. */
export function envChatModel(): string {
  return (
    process.env.AI_MODEL?.trim() || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o"
  );
}

export function envEmbedModel(): string {
  return (
    process.env.AI_EMBEDDING_MODEL?.trim() ||
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT ||
    "text-embedding-3-small"
  );
}

export function imageModel(): string {
  return (
    getSetting(SETTING_IMAGE_MODEL) ||
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT ||
    "gpt-image-2.5-sunburst"
  );
}

/** Reading images is a chat-model capability, so it falls back to that one. */
export function visionModel(): string {
  return (
    getSetting(SETTING_VISION_MODEL) ||
    process.env.AI_VISION_MODEL?.trim() ||
    process.env.AZURE_OPENAI_VISION_DEPLOYMENT ||
    chatModel()
  );
}

export function envVisionModel(): string {
  return (
    process.env.AI_VISION_MODEL?.trim() ||
    process.env.AZURE_OPENAI_VISION_DEPLOYMENT ||
    envChatModel()
  );
}

export function envImageModel(): string {
  return (
    process.env.AI_IMAGE_MODEL?.trim() ||
    process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT ||
    "gpt-image-2.5-sunburst"
  );
}

/**
 * Image generation sits on a different Azure api-version than inference — the
 * dated inference release (2024-10-21) predates the image endpoint and 404s.
 */
const IMAGE_API_VERSION =
  process.env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview";

export type GeneratedImage = { png: Buffer; model: string; size: string };

/**
 * Renders a prompt to a PNG. Returns raw bytes rather than a URL because the
 * gpt-image family replies with base64 and no hosted URL to fetch.
 */
export async function generateImage(
  prompt: string,
  opts: { size?: string; quality?: string } = {}
): Promise<GeneratedImage> {
  const model = imageModel();
  const size = opts.size || "1536x1024";
  const quality = opts.quality || "high";

  const url =
    PROVIDER === "azure"
      ? `${endpoint?.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(
          model
        )}/images/generations?api-version=${IMAGE_API_VERSION}`
      : `${baseURL?.replace(/\/$/, "")}/images/generations`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(
        PROVIDER === "azure"
          ? { prompt, n: 1, size, quality }
          : { model, prompt, n: 1, size, response_format: "b64_json" }
      ),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = Object.assign(
        new Error(
          `Image generation failed (${res.status}). ${body.slice(0, 400)}`
        ),
        {
          status: res.status,
          // withRetry honours Retry-After when it is present. Without this the
          // backoff guesses, and on a small image deployment it guesses short.
          headers: Object.fromEntries(res.headers.entries()),
        }
      );
      throw err;
    }

    const json = (await res.json()) as {
      data?: { b64_json?: string; url?: string }[];
    };
    const first = json.data?.[0];

    // Some OpenAI-compatible servers ignore response_format and hand back a URL.
    if (!first?.b64_json && first?.url) {
      const img = await fetch(first.url);
      if (!img.ok) throw new Error(`Could not download generated image (${img.status}).`);
      return { png: Buffer.from(await img.arrayBuffer()), model, size };
    }

    if (!first?.b64_json) {
      throw new Error("The image model returned no image data.");
    }
    return { png: Buffer.from(first.b64_json, "base64"), model, size };
  }, "image");
}

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

let client: OpenAI | AzureOpenAI | null = null;
let tokenProvider: (() => Promise<string>) | null = null;

/**
 * Auth headers for calling the provider directly, for the few endpoints the
 * SDK does not wrap — notably Azure's deployment listing, which lives on an
 * older api-version than inference.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (PROVIDER === "openai") {
    const key = process.env.AI_API_KEY?.trim();
    return key ? { Authorization: `Bearer ${key}` } : {};
  }
  if (apiKey) return { "api-key": apiKey };
  if (!tokenProvider) tokenProvider = getBearerTokenProvider(buildCredential(), SCOPE);
  return { Authorization: `Bearer ${await tokenProvider()}` };
}

export function getClient(): OpenAI | AzureOpenAI {
  if (client) return client;

  if (PROVIDER === "openai") {
    client = new OpenAI({
      baseURL,
      // Local runtimes ignore this, but the SDK refuses to construct without it.
      apiKey: process.env.AI_API_KEY?.trim() || "not-needed",
    });
    return client;
  }

  if (!endpoint) {
    throw new MissingConfigError(
      "No model provider is configured. Set AI_BASE_URL for an OpenAI-compatible endpoint " +
        "(llama.cpp, Ollama, LM Studio, vLLM, OpenAI), or AZURE_OPENAI_ENDPOINT for Azure. " +
        "See .env.example."
    );
  }

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

/** Turn provider failures into actionable setup guidance rather than a raw code. */
export function describeAuthError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  const code = (e as { code?: string })?.code;

  if (PROVIDER === "openai") {
    // Nothing listening is by far the most common failure with a local runtime,
    // and the SDK surfaces it as a bare connection error.
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      /connection error|fetch failed|ECONNREFUSED/i.test(msg)
    ) {
      return `Could not reach the model server at ${baseURL}. Check it is running — for llama.cpp that is 'llama-server --port 8080 -m <model.gguf>', for Ollama 'ollama serve' — and that AI_BASE_URL points at its OpenAI-compatible path (usually ending in /v1).`;
    }
    if (status === 404) {
      return `The model server at ${baseURL} returned 404. Check that AI_MODEL ("${chatModel()}") and AI_EMBEDDING_MODEL ("${embedModel()}") are loaded — with Ollama, 'ollama list' shows what is available.`;
    }
    if (status === 501) {
      return `The model server does not support this operation. Embeddings in particular need a server started with embedding support (llama.cpp: '--embeddings'; Ollama: pull a dedicated model such as nomic-embed-text and set AI_EMBEDDING_MODEL).`;
    }
    if (status === 401 || status === 403) {
      return `The model server at ${baseURL} rejected the credential. Set AI_API_KEY if it requires one.`;
    }
    return null;
  }

  // A 404 here almost always means a misconfigured api-version or a deployment
  // name that does not exist, not a missing resource.
  if (status === 404) {
    const hint = apiVersionLooksWrong
      ? `AZURE_OPENAI_API_VERSION is set to "${apiVersion}", which is not an Azure API version — model versions like "2025-08-07" are not valid here. Use "${DEFAULT_API_VERSION}".`
      : `Check that the deployment names AZURE_OPENAI_DEPLOYMENT ("${chatModel()}") and AZURE_OPENAI_EMBEDDING_DEPLOYMENT ("${embedModel()}") exist on ${endpoint}.`;
    return `Azure OpenAI returned 404. ${hint}`;
  }

  // Retries are already exhausted by the time this is reached.
  if (status === 429) {
    return `Azure OpenAI rate limit exceeded for deployment "${chatModel()}" and automatic retries did not clear it. The deployment's tokens-per-minute quota is likely too small for this much source material — raise its capacity in Azure AI Foundry, select fewer sources, or use a larger deployment.`;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Small deployments (e.g. a 10K-TPM gpt-5-mini) routinely 429 on the large
 * contexts studio generation sends. Azure returns a Retry-After telling us
 * exactly how long to wait, so honour it instead of failing the request.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const MAX_ATTEMPTS = 5;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number })?.status;
      const retryable = status === 429 || (status !== undefined && status >= 500);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw e;

      const headers = (e as { headers?: Record<string, string> })?.headers;
      const after = Number(headers?.["retry-after"]);
      const waitMs = Number.isFinite(after) && after > 0
        ? after * 1000
        : Math.min(30_000, 2 ** attempt * 1000) + Math.random() * 500;

      console.warn(
        `[ai] ${label} got ${status}, retrying in ${Math.round(waitMs / 1000)}s ` +
          `(attempt ${attempt + 1}/${MAX_ATTEMPTS})`
      );
      await sleep(waitMs);
    }
  }
  throw lastError;
}

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
  const withoutTemp = () => {
    const { temperature: _omit, ...rest } = params;
    return rest as ChatParams;
  };

  return withRetry(async () => {
    if (supportsTemperature === false) {
      return client.chat.completions.create(withoutTemp());
    }
    try {
      const res = await client.chat.completions.create(params as ChatParams);
      if (supportsTemperature === null) supportsTemperature = true;
      return res;
    } catch (e) {
      if (!isTemperatureRejection(e)) throw e;
      supportsTemperature = false;
      return client.chat.completions.create(withoutTemp());
    }
  }, "chat");
}

export async function chatText(messages: ChatMsg[], temperature = 0.3): Promise<string> {
  const res = await createChat({ model: chatModel(), temperature, messages });
  return (
    (res as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content?.trim() ??
    ""
  );
}

export async function chatStream(messages: ChatMsg[], temperature = 0.3) {
  const res = await createChat({
    model: chatModel(),
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
    model: chatModel(),
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
  const BATCH = 64;  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) => t.slice(0, 8000) || " ");
    const res = await withRetry(
      () => getClient().embeddings.create({ model: embedModel(), input: slice }),
      "embeddings"
    );
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}
