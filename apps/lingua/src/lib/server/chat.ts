/**
 * Plain chat completions for translations and recaps, via the v1 API that
 * both Azure OpenAI and OpenAI expose.
 */
import {
  NotConfiguredError,
  ProviderError,
  authHeaders,
  chatModel,
  describeProviderError,
  provider,
} from "./provider";

export type ChatMessage = { role: "system" | "user"; content: string };

export async function chatComplete(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number } = {}
): Promise<string> {
  const model = chatModel();
  if (!model) {
    throw new NotConfiguredError(
      "Set AZURE_OPENAI_DEPLOYMENT to a chat model to enable translations and recaps."
    );
  }
  const { baseUrl } = provider();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(opts.maxTokens ? { max_completion_tokens: opts.maxTokens } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new ProviderError(res.status, describeProviderError(res.status, await res.text()));
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError(502, "The chat model returned an empty reply.");
  return content;
}

/** Parse a model's JSON reply, tolerating a stray code fence. */
export function parseModelJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(trimmed);
}
