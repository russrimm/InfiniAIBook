import { FormData } from "undici";
import { safeFetch } from "./safefetch";
import {
  pixelSize,
  type ClipCapabilities,
  type ClipProviderKind,
  type ClipRequest,
  type ProviderCall,
  type RemoteFailure,
  type RemoteJob,
  type RemoteStatus,
  type VideoProvider,
} from "./videoclip";
import {
  httpError,
  looksModerated,
  readJson,
  safeRemoteId,
  streamToFile,
  videoFetch,
} from "./videohttp";

/**
 * The OpenAI Videos API shape, which Azure OpenAI / Microsoft Foundry also
 * serves under /openai/v1:
 *
 *   POST   {base}/videos                     multipart: model, prompt, size, seconds, input_reference
 *   GET    {base}/videos/{id}                { id, status, progress, error }
 *   GET    {base}/videos/{id}/content        ?variant=video | thumbnail
 *   DELETE {base}/videos/{id}
 *
 * Sora 2 was the model behind it. Azure retired sora-2 on 2026-11-02 and OpenAI
 * discontinued the Sora API on 2026-09-24, so nothing defaults to it: the model
 * is whatever the operator names. Any gateway that implements this shape works.
 *
 * Source: https://learn.microsoft.com/azure/foundry/openai/concepts/video-generation
 */

export type OpenAIVideoConfig = {
  kind: Extract<ClipProviderKind, "openai" | "azure">;
  label: string;
  /** Model id, or the deployment name on Azure. */
  model: string;
  /** Includes the version segment, e.g. https://api.openai.com/v1 or https://x.openai.azure.com/openai/v1. */
  baseUrl: string;
  /** Appended to every URL, e.g. "api-version=preview". */
  query?: string;
  /**
   * Auth headers for the nth attempt at a request. A 401 on attempt 0 tries
   * attempt 1, which lets Azure fall back to a second token audience.
   */
  authHeaders: (attempt: number) => Promise<Record<string, string> | null>;
  aspects: ClipCapabilities["aspects"];
  durations: number[];
  resolutions: ClipCapabilities["resolutions"];
  defaultResolution: string;
  prices: Record<string, number>;
  priceNote: string;
  maxVariants?: number;
  maxClips?: number;
};

export function openaiCapabilities(cfg: OpenAIVideoConfig): ClipCapabilities {
  return {
    kind: cfg.kind,
    label: cfg.label,
    model: cfg.model,
    aspects: cfg.aspects,
    durations: cfg.durations,
    resolutions: cfg.resolutions,
    defaultResolution: cfg.defaultResolution,
    maxVariants: cfg.maxVariants ?? 3,
    maxClips: cfg.maxClips ?? 6,
    referenceImage: true,
    prices: cfg.prices,
    priceNote: cfg.priceNote,
  };
}

type VideoObject = {
  id?: string;
  status?: string;
  progress?: number;
  error?: { code?: unknown; message?: unknown } | string | null;
};

const STATUS: Record<string, RemoteStatus> = {
  queued: "queued",
  pending: "queued",
  in_progress: "in_progress",
  running: "in_progress",
  processing: "in_progress",
  preprocessing: "in_progress",
  completed: "completed",
  succeeded: "completed",
  failed: "failed",
  cancelled: "failed",
  canceled: "failed",
  error: "failed",
};

function toJob(v: VideoObject): RemoteJob {
  const id = safeRemoteId(v.id);
  const status = STATUS[(v.status ?? "").toLowerCase()] ?? "in_progress";
  const e = v.error;
  let error: RemoteFailure | undefined;
  if (e) {
    const message = typeof e === "string" ? e : typeof e.message === "string" ? e.message : "The video model reported an error.";
    const code = typeof e === "object" && typeof e.code === "string" ? e.code : undefined;
    error = { code, message, moderation: looksModerated(code, message) };
  }
  if (status === "failed" && !error) {
    error = { message: `The video job ${v.status ?? "failed"}.` };
  }
  return {
    id,
    status: error && status !== "completed" ? "failed" : status,
    ...(typeof v.progress === "number" ? { progress: Math.max(0, Math.min(100, v.progress)) } : {}),
    ...(error && status !== "completed" ? { error } : {}),
  };
}

export function createOpenAIVideoProvider(
  cfg: OpenAIVideoConfig,
  deps: { fetch?: typeof fetch } = {},
): VideoProvider {
  const doFetch = deps.fetch ?? videoFetch;
  const base = cfg.baseUrl.replace(/\/+$/, "");

  const url = (path: string, extra = ""): string => {
    const q = [extra, cfg.query].filter(Boolean).join("&");
    return `${base}${path}${q ? `?${q}` : ""}`;
  };

  /** Send with auth, trying the next auth attempt once if the first is refused. */
  const send = async (target: string, init: RequestInit): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      const auth = await cfg.authHeaders(attempt);
      if (auth === null) throw new Error("No credential is available for the video endpoint.");
      const res = await doFetch(target, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), ...auth, "user-agent": "InfiniAIBook" },
      });
      if (res.status !== 401 || attempt >= 1 || (await cfg.authHeaders(attempt + 1)) === null) return res;
      void res.body?.cancel().catch(() => {});
    }
  };

  /** A content download. A redirect to storage is followed without the credential and only to public hosts. */
  const content = async (id: string, variant: string, call: ProviderCall): Promise<Response> => {
    const res = await send(url(`/videos/${encodeURIComponent(id)}/content`, `variant=${variant}`), {
      redirect: "manual",
      signal: call.signal,
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      void res.body?.cancel().catch(() => {});
      const next = new URL(location, base).toString();
      return (await safeFetch(next, { signal: call.signal })).res;
    }
    return res;
  };

  return {
    kind: cfg.kind,
    capabilities: () => openaiCapabilities(cfg),

    async start(req: ClipRequest, prompt: string, call: ProviderCall = {}) {
      const size = pixelSize(req.aspect, req.resolution);
      if (!size) throw new Error(`${cfg.label} has no size for ${req.aspect} at ${req.resolution}.`);
      // undici's own FormData: its fetch (see videoFetch) does not recognize the global class.
      const form = new FormData();
      form.set("model", cfg.model);
      form.set("prompt", prompt);
      form.set("size", size);
      form.set("seconds", String(req.duration));
      if (req.reference) {
        const bytes = Buffer.from(req.reference.data, "base64");
        const ext = req.reference.mime.split("/")[1];
        form.set("input_reference", new Blob([bytes], { type: req.reference.mime }), `reference.${ext}`);
      }
      const res = await send(url("/videos"), { method: "POST", body: form as unknown as BodyInit, signal: call.signal });
      if (!res.ok) throw await httpError(res, "The video request");
      return toJob(await readJson<VideoObject>(res, "the video job"));
    },

    async poll(id: string, call: ProviderCall = {}) {
      const res = await send(url(`/videos/${encodeURIComponent(safeRemoteId(id))}`), { signal: call.signal });
      if (!res.ok) throw await httpError(res, "Checking the video");
      return toJob(await readJson<VideoObject>(res, "the video status"));
    },

    async download(job: RemoteJob, dest: string, maxBytes: number, call: ProviderCall = {}) {
      const res = await content(safeRemoteId(job.id), "video", call);
      if (!res.ok) throw await httpError(res, "Downloading the clip");
      return streamToFile(res, dest, maxBytes, { signal: call.signal });
    },

    async poster(job: RemoteJob, dest: string, maxBytes: number, call: ProviderCall = {}) {
      try {
        const res = await content(safeRemoteId(job.id), "thumbnail", call);
        if (!res.ok) {
          void res.body?.cancel().catch(() => {});
          return false;
        }
        await streamToFile(res, dest, Math.min(maxBytes, 8 * 1024 * 1024), { signal: call.signal, kind: "any" });
        return true;
      } catch {
        return false;
      }
    },

    async remove(id: string, call: ProviderCall = {}) {
      const res = await send(url(`/videos/${encodeURIComponent(safeRemoteId(id))}`), {
        method: "DELETE",
        signal: call.signal,
      }).catch(() => null);
      void res?.body?.cancel().catch(() => {});
    },
  };
}
