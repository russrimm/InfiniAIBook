/**
 * Named presets for OpenAI-compatible providers.
 *
 * Every provider here exposes an OpenAI-compatible HTTP API, so one client
 * covers all of them; a preset only supplies the base URL, which environment
 * variable holds the key, and sensible default models. Anything a preset sets
 * can still be overridden with AI_BASE_URL, AI_API_KEY, AI_MODEL and
 * AI_EMBEDDING_MODEL.
 *
 * Kept free of SDK imports so the UI can read it too.
 */
export type ProviderPreset = {
  label: string;
  baseURL: string;
  /** Environment variable conventionally holding this provider's key. */
  keyEnv?: string;
  chatModel?: string;
  /** Unset for providers that do not offer an embeddings endpoint. */
  embedModel?: string;
  transcriptionModel?: string;
  /** Runs on this machine; an API key is not required. */
  local?: boolean;
};

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    chatModel: "gpt-4o-mini",
    embedModel: "text-embedding-3-small",
    transcriptionModel: "whisper-1",
  },
  anthropic: {
    label: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    keyEnv: "ANTHROPIC_API_KEY",
    chatModel: "claude-sonnet-4-5",
  },
  gemini: {
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    chatModel: "gemini-2.5-flash",
    embedModel: "gemini-embedding-001",
  },
  groq: {
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    chatModel: "llama-3.3-70b-versatile",
    transcriptionModel: "whisper-large-v3",
  },
  mistral: {
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    chatModel: "mistral-small-latest",
    embedModel: "mistral-embed",
  },
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    chatModel: "deepseek-chat",
  },
  openrouter: {
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    chatModel: "openai/gpt-4o-mini",
  },
  xai: {
    label: "xAI",
    baseURL: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    chatModel: "grok-3-mini",
  },
  perplexity: {
    label: "Perplexity",
    baseURL: "https://api.perplexity.ai",
    keyEnv: "PERPLEXITY_API_KEY",
    chatModel: "sonar",
  },
  together: {
    label: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    keyEnv: "TOGETHER_API_KEY",
    chatModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    embedModel: "BAAI/bge-large-en-v1.5",
  },
  ollama: {
    label: "Ollama",
    baseURL: "http://localhost:11434/v1",
    chatModel: "qwen3.5:latest",
    embedModel: "nomic-embed-text",
    local: true,
  },
  lmstudio: {
    label: "LM Studio",
    baseURL: "http://localhost:1234/v1",
    local: true,
  },
  llamacpp: {
    label: "llama.cpp",
    baseURL: "http://localhost:8080/v1",
    local: true,
  },
};

export type ResolvedEndpoint = {
  /** Preset key, "custom" for a bare base URL, or null when nothing is set. */
  name: string | null;
  label: string;
  baseURL: string | null;
  apiKey: string | undefined;
  preset: ProviderPreset | null;
};

const env = (k: string) => process.env[k]?.trim() || undefined;

/**
 * Resolve an endpoint from `<prefix>_PROVIDER`, `<prefix>_BASE_URL` and
 * `<prefix>_API_KEY`. With prefix "AI" this is the main provider; "AI_EMBEDDING"
 * and "AI_TRANSCRIPTION" let those two jobs go to a different provider, which is
 * what a chat-only provider such as Anthropic or Groq needs for retrieval.
 */
export function resolveEndpoint(prefix: string): ResolvedEndpoint {
  const named = env(`${prefix}_PROVIDER`)?.toLowerCase();
  const preset = named ? PROVIDER_PRESETS[named] ?? null : null;
  if (named && !preset && named !== "azure") {
    console.warn(
      `[ai] ${prefix}_PROVIDER="${named}" is not a known provider. Known: ${Object.keys(
        PROVIDER_PRESETS
      ).join(", ")}, azure.`
    );
  }
  const baseURL = env(`${prefix}_BASE_URL`) ?? preset?.baseURL ?? null;
  const apiKey =
    env(`${prefix}_API_KEY`) ?? (preset?.keyEnv ? env(preset.keyEnv) : undefined);
  return {
    name: preset ? named! : baseURL ? "custom" : null,
    label: preset?.label ?? (baseURL ? "OpenAI-compatible" : "Azure OpenAI"),
    baseURL,
    apiKey,
    preset,
  };
}
