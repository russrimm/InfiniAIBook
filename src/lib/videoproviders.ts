import { getBearerTokenProvider } from "@azure/identity";
import { buildCredential } from "./azureCredential";
import type { ClipAspect, ClipCapabilities, VideoProvider } from "./videoclip";
import { createGeminiProvider, GEMINI_BASE_URL, GEMINI_DEFAULT_MODEL, GEMINI_PRICES, geminiCapabilities, type GeminiVideoConfig } from "./videogemini";
import { createOpenAIVideoProvider, openaiCapabilities, type OpenAIVideoConfig } from "./videoopenai";

/**
 * Which video model, if any, this process is set up to use.
 *
 * Nothing is assumed. With no AI_VIDEO_* or AZURE_OPENAI_VIDEO_DEPLOYMENT
 * variable set, video is simply off: the Studio card says so and nothing is
 * ever billed. A GEMINI_API_KEY alone does not turn it on, because that key is
 * also used for YouTube transcripts and video is the costliest thing it could
 * start paying for.
 *
 *   AI_VIDEO_PROVIDER = gemini | azure | openai   (or inferred, see below)
 *   AI_VIDEO_MODEL    = model id, or the deployment name on Azure
 *   AI_VIDEO_BASE_URL / AI_VIDEO_API_KEY           for an OpenAI-compatible endpoint
 *   AZURE_OPENAI_VIDEO_DEPLOYMENT                  for Azure / Foundry
 */

type Env = Record<string, string | undefined>;

export type VideoConfig =
  | ({ kind: "gemini" } & GeminiVideoConfig)
  | ({ kind: "openai" | "azure" } & Omit<OpenAIVideoConfig, "authHeaders" | "kind"> & {
      apiKey?: string;
      endpoint?: string;
    });

export type VideoSetup =
  | { configured: true; config: VideoConfig }
  | { configured: false; reason: string };

const clean = (env: Env, key: string): string | undefined => env[key]?.trim() || undefined;

function list<T extends string>(raw: string | undefined, fallback: T[], ok: (v: string) => boolean): T[] {
  const items = (raw ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const good = items.filter(ok) as T[];
  return good.length ? [...new Set(good)] : fallback;
}

/** The per-second price an operator set, for every resolution, or null. */
function priceOverride(env: Env): number | null {
  const raw = clean(env, "AI_VIDEO_PRICE_PER_SECOND_USD");
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : null;
}

const flat = (ids: string[], rate: number): Record<string, number> => Object.fromEntries(ids.map((id) => [id, rate]));

export function resolveVideoSetup(env: Env = process.env): VideoSetup {
  const named = clean(env, "AI_VIDEO_PROVIDER")?.toLowerCase();
  const model = clean(env, "AI_VIDEO_MODEL");
  const azureDeployment = clean(env, "AZURE_OPENAI_VIDEO_DEPLOYMENT");
  const azureEndpoint = clean(env, "AZURE_OPENAI_ENDPOINT")?.replace(/\/+$/, "");
  const baseUrl = clean(env, "AI_VIDEO_BASE_URL")?.replace(/\/+$/, "");

  const kind: "gemini" | "azure" | "openai" | null =
    named === "gemini" || named === "azure"
      ? named
      : named === "openai" || named === "custom"
        ? "openai"
        : named
          ? null
          : azureDeployment
            ? "azure"
            : model?.toLowerCase().startsWith("gemini")
              ? "gemini"
              : baseUrl
                ? "openai"
                : null;

  if (named && !kind) {
    return { configured: false, reason: `AI_VIDEO_PROVIDER="${named}" is not a known video provider. Use gemini, azure or openai.` };
  }
  if (!kind) return { configured: false, reason: "No video model is configured." };

  const override = priceOverride(env);

  if (kind === "gemini") {
    const apiKey = clean(env, "AI_VIDEO_API_KEY") ?? clean(env, "GEMINI_API_KEY");
    if (!apiKey) return { configured: false, reason: "Gemini video needs GEMINI_API_KEY (a Google AI Studio key on the paid tier)." };
    return {
      configured: true,
      config: {
        kind: "gemini",
        model: model ?? GEMINI_DEFAULT_MODEL,
        apiKey,
        baseUrl: baseUrl ?? GEMINI_BASE_URL,
        prices: override === null ? GEMINI_PRICES : flat(Object.keys(GEMINI_PRICES), override),
        ...(override === null ? {} : { priceNote: "Set by AI_VIDEO_PRICE_PER_SECOND_USD." }),
      },
    };
  }

  const aspects = list<ClipAspect>(clean(env, "AI_VIDEO_ASPECTS"), ["16:9", "9:16"], (v) => ["16:9", "9:16", "1:1"].includes(v));
  const durations = list<string>(clean(env, "AI_VIDEO_DURATIONS"), ["4", "8", "12"], (v) => /^\d{1,2}$/.test(v) && Number(v) > 0)
    .map(Number)
    .sort((a, b) => a - b);
  const resIds = list<string>(clean(env, "AI_VIDEO_RESOLUTIONS"), ["720p"], (v) => /^(480|720|1080|1792)p?$/i.test(v)).map((v) =>
    /p$/i.test(v) ? v.toLowerCase() : `${v}p`,
  );
  const rate = override ?? 0.1;
  const common = {
    aspects,
    durations,
    resolutions: resIds.map((id) => ({ id, label: id })),
    defaultResolution: resIds[0],
    prices: flat(resIds, rate),
    priceNote:
      override === null
        ? "A provider-neutral default of $0.10 per second. Set AI_VIDEO_PRICE_PER_SECOND_USD to your provider's rate."
        : "Set by AI_VIDEO_PRICE_PER_SECOND_USD.",
  };

  if (kind === "azure") {
    const deployment = azureDeployment ?? model;
    if (!azureEndpoint) return { configured: false, reason: "Azure video needs AZURE_OPENAI_ENDPOINT." };
    if (!deployment) {
      return { configured: false, reason: "Azure video needs AZURE_OPENAI_VIDEO_DEPLOYMENT, the name of a video model deployment." };
    }
    const version = clean(env, "AZURE_OPENAI_VIDEO_API_VERSION");
    return {
      configured: true,
      config: {
        kind: "azure",
        label: "Azure OpenAI (Microsoft Foundry)",
        model: deployment,
        baseUrl: `${azureEndpoint}/openai/v1`,
        ...(version ? { query: `api-version=${encodeURIComponent(version)}` } : {}),
        apiKey: clean(env, "AZURE_OPENAI_API_KEY"),
        endpoint: azureEndpoint,
        ...common,
      },
    };
  }

  const url = baseUrl ?? (named === "openai" ? "https://api.openai.com/v1" : undefined);
  if (!url) return { configured: false, reason: "Set AI_VIDEO_BASE_URL to an OpenAI-compatible Videos API endpoint." };
  if (!model) {
    return { configured: false, reason: "Set AI_VIDEO_MODEL to a model that endpoint serves. No default is assumed, because Sora 2 is retired." };
  }
  const official = /^https:\/\/api\.openai\.com\//i.test(url);
  return {
    configured: true,
    config: {
      kind: "openai",
      label: official ? "OpenAI" : "OpenAI-compatible video endpoint",
      model,
      baseUrl: url,
      apiKey: clean(env, "AI_VIDEO_API_KEY") ?? clean(env, "OPENAI_API_KEY") ?? clean(env, "AI_API_KEY"),
      ...common,
    },
  };
}

/** Entra tokens for Azure: the documented audience first, then the one the rest of the app uses. */
const SCOPES = ["https://ai.azure.com/.default", "https://cognitiveservices.azure.com/.default"];
const tokenProviders = new Map<string, () => Promise<string>>();

async function azureAuth(apiKey: string | undefined, attempt: number, env: Env): Promise<Record<string, string> | null> {
  if (apiKey) return attempt === 0 ? { "api-key": apiKey } : null;
  const custom = clean(env, "AZURE_OPENAI_VIDEO_SCOPE");
  const scope = (custom ? [custom] : SCOPES)[attempt];
  if (!scope) return null;
  let provider = tokenProviders.get(scope);
  if (!provider) {
    provider = getBearerTokenProvider(buildCredential(), scope);
    tokenProviders.set(scope, provider);
  }
  return { Authorization: `Bearer ${await provider()}` };
}

export function capabilitiesOf(config: VideoConfig): ClipCapabilities {
  return config.kind === "gemini"
    ? geminiCapabilities(config)
    : openaiCapabilities({ ...config, kind: config.kind, authHeaders: async () => null });
}

export function buildProvider(config: VideoConfig, deps: { fetch?: typeof fetch; env?: Env } = {}): VideoProvider {
  if (config.kind === "gemini") return createGeminiProvider(config, deps);
  const env = deps.env ?? process.env;
  const kind = config.kind;
  return createOpenAIVideoProvider(
    {
      ...config,
      kind,
      authHeaders: async (attempt) => {
        if (kind === "azure") return azureAuth(config.apiKey, attempt, env);
        if (attempt > 0) return null;
        return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
      },
    },
    deps,
  );
}

let cached: { key: string; provider: VideoProvider } | null = null;

/** The configured provider, or null when video is off. Rebuilt when the environment changes. */
export function currentVideoProvider(env: Env = process.env): VideoProvider | null {
  const setup = resolveVideoSetup(env);
  if (!setup.configured) return null;
  const key = JSON.stringify(setup.config);
  if (cached?.key !== key) cached = { key, provider: buildProvider(setup.config, { env }) };
  return cached.provider;
}

/** Everything the browser needs to decide whether and how to offer video clips. */
export function videoStatus(
  env: Env = process.env,
): { configured: true; capabilities: ClipCapabilities } | { configured: false; reason: string } {
  const setup = resolveVideoSetup(env);
  return setup.configured
    ? { configured: true, capabilities: capabilitiesOf(setup.config) }
    : { configured: false, reason: setup.reason };
}
