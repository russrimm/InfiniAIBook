import type {
  ClipCapabilities,
  ClipRequest,
  ProviderCall,
  RemoteFailure,
  RemoteJob,
  VideoProvider,
} from "./videoclip";
import {
  httpError,
  looksModerated,
  readJson,
  safeRemoteId,
  videoFetch,
  writeVideoFile,
} from "./videohttp";

/**
 * Google Gemini video generation (Gemini Omni Flash) through the Interactions
 * API.
 *
 *   POST {base}/v1beta/interactions   { model, input, response_format: { type: "video", ... } }
 *
 * The reply carries the finished MP4 as base64 in `steps[].content[]`, so there
 * is no separate download. An interaction that is still running is polled with
 * GET {base}/v1beta/interactions/{id}. Billing is per output second.
 *
 * Source: https://ai.google.dev/gemini-api/docs/omni (checked November 2026).
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const GEMINI_DEFAULT_MODEL = "gemini-omni-1.2-flash";

/** Dollars per output second, from Google's Gemini Developer API pricing page (Standard tier). */
export const GEMINI_PRICES: Record<string, number> = { "360p": 0.023, "720p": 0.07, "1080p": 0.104 };

export type GeminiVideoConfig = {
  model: string;
  apiKey: string;
  baseUrl: string;
  prices?: Record<string, number>;
  priceNote?: string;
};

export function geminiCapabilities(cfg: GeminiVideoConfig): ClipCapabilities {
  return {
    kind: "gemini",
    label: "Google Gemini",
    model: cfg.model,
    aspects: ["16:9", "9:16"],
    durations: [3, 5, 8, 10, 15],
    resolutions: [
      { id: "360p", label: "360p (draft)" },
      { id: "720p", label: "720p" },
      { id: "1080p", label: "1080p (upscaled)" },
    ],
    defaultResolution: "720p",
    maxVariants: 3,
    maxClips: 6,
    referenceImage: true,
    prices: cfg.prices ?? GEMINI_PRICES,
    priceNote: cfg.priceNote ?? "Google's published Gemini Developer API rate, about $0.07 per second at 720p. An estimate: check ai.google.dev/pricing.",
  };
}

type Interaction = {
  id?: string;
  status?: string;
  error?: { code?: unknown; message?: unknown; status?: unknown } | string;
  steps?: { type?: string; content?: { type?: string; text?: string; mime_type?: string; data?: string }[] }[];
};

function failureOf(i: Interaction): RemoteFailure | undefined {
  const e = i.error;
  if (!e) return undefined;
  const message = typeof e === "string" ? e : typeof e.message === "string" ? e.message : "The video model reported an error.";
  const code = typeof e === "object" && typeof (e.code ?? e.status) === "string" ? String(e.code ?? e.status) : undefined;
  return { code, message, moderation: looksModerated(code, message) };
}

/** The first video and any text the model wrote instead (a refusal is usually prose). */
function outputOf(i: Interaction): { video?: Uint8Array; text: string } {
  let video: Uint8Array | undefined;
  const text: string[] = [];
  for (const step of i.steps ?? []) {
    if (step.type && step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (part.type === "video" && typeof part.data === "string" && !video) {
        video = Buffer.from(part.data, "base64");
      } else if (part.type === "text" && part.text) {
        text.push(part.text);
      }
    }
  }
  return { video, text: text.join(" ").trim() };
}

function toJob(i: Interaction): RemoteJob {
  const id = safeRemoteId(i.id ?? "pending");
  const status = (i.status ?? "").toLowerCase();
  const failure = failureOf(i);
  if (status === "failed" || status === "cancelled" || failure) {
    return {
      id,
      status: "failed",
      error: failure ?? { message: status === "cancelled" ? "The video request was cancelled." : "The video model failed." },
    };
  }
  const { video, text } = outputOf(i);
  if (video) return { id, status: "completed", progress: 100, inline: video };
  if (status === "queued" || status === "in_progress" || status === "running" || status === "requires_action") {
    return { id, status: status === "queued" ? "queued" : "in_progress" };
  }
  // Finished without a video: models answer a refused prompt in words.
  return {
    id,
    status: "failed",
    error: {
      message: text
        ? `The model did not return a video: ${text.slice(0, 300)}`
        : "The model finished without returning a video. The prompt may have been blocked by its content filters.",
      moderation: true,
    },
  };
}

export function createGeminiProvider(
  cfg: GeminiVideoConfig,
  deps: { fetch?: typeof fetch } = {},
): VideoProvider {
  const doFetch = deps.fetch ?? videoFetch;
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const headers = { "x-goog-api-key": cfg.apiKey, "user-agent": "InfiniAIBook" };

  return {
    kind: "gemini",
    capabilities: () => geminiCapabilities(cfg),

    async start(req: ClipRequest, prompt: string, call: ProviderCall = {}) {
      const format: Record<string, unknown> = {
        type: "video",
        aspect_ratio: req.aspect,
        resolution: req.resolution,
        duration: `${req.duration}s`,
      };
      const input = req.reference
        ? [
            { type: "image", data: req.reference.data, mime_type: req.reference.mime },
            { type: "text", text: prompt },
          ]
        : prompt;
      const res = await doFetch(`${base}/v1beta/interactions`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.model, input, response_format: format }),
        signal: call.signal,
      });
      if (!res.ok) throw await httpError(res, "The video request");
      return toJob(await readJson<Interaction>(res, "the video", 400 * 1024 * 1024));
    },

    async poll(id: string, call: ProviderCall = {}) {
      const res = await doFetch(`${base}/v1beta/interactions/${encodeURIComponent(safeRemoteId(id))}`, {
        headers,
        signal: call.signal,
      });
      if (!res.ok) throw await httpError(res, "Checking the video");
      return toJob(await readJson<Interaction>(res, "the video", 400 * 1024 * 1024));
    },

    async download(job: RemoteJob, dest: string, maxBytes: number) {
      if (!job.inline) throw new Error("The video model has not returned this clip yet.");
      return writeVideoFile(dest, job.inline, maxBytes);
    },

    async remove(id: string, call: ProviderCall = {}) {
      if (id === "pending") return;
      await doFetch(`${base}/v1beta/interactions/${encodeURIComponent(safeRemoteId(id))}`, {
        method: "DELETE",
        headers,
        signal: call.signal,
      }).catch(() => {});
    },
  };
}
