import { AzureOpenAI } from "openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

export const CHAT_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o";
export const EMBED_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-3-small";

export class MissingConfigError extends Error {}

let client: AzureOpenAI | null = null;

export function getClient(): AzureOpenAI {
  if (!endpoint || !apiKey) {
    throw new MissingConfigError(
      "Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in .env.local (see .env.example)."
    );
  }
  if (!client) client = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  return client;
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
