/**
 * Short AI video clips: the vocabulary shared by every video provider.
 *
 * Pure and import-free, so the browser can read the capability table to build
 * its controls and tests can run it without a server. Everything a provider
 * differs on (sizes, durations, price) is data in a ClipCapabilities, and the
 * request a person builds is checked against it here before any money is spent.
 */

export type ClipProviderKind = "gemini" | "openai" | "azure";

export type ClipAspect = "16:9" | "9:16" | "1:1";

export const ASPECT_LABELS: Record<ClipAspect, string> = {
  "16:9": "Landscape 16:9",
  "9:16": "Portrait 9:16",
  "1:1": "Square 1:1",
};

export type ClipResolution = { id: string; label: string };

/** What the configured video model can do, and what it costs. Safe to send to the browser. */
export type ClipCapabilities = {
  kind: ClipProviderKind;
  /** For the UI, e.g. "Google Gemini". */
  label: string;
  /** The model id, or the deployment name on Azure. */
  model: string;
  aspects: ClipAspect[];
  /** Whole seconds the API accepts. */
  durations: number[];
  resolutions: ClipResolution[];
  defaultResolution: string;
  /** Most variants of one prompt in a single run. */
  maxVariants: number;
  /** Most clips (prompts times variants) in a single run. */
  maxClips: number;
  /** Whether a still can anchor the first frame. */
  referenceImage: boolean;
  /** US dollars per generated second by resolution id. An estimate, never a quote. */
  prices: Record<string, number>;
  /** Where the prices came from, or that the operator set them. */
  priceNote: string;
};

export const MAX_PROMPTS = 3;
export const MAX_PROMPT_CHARS = 1500;
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
export const REFERENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ClipReference = { mime: (typeof REFERENCE_TYPES)[number]; data: string };

export type ClipRequest = {
  /** One entry per distinct clip idea, each produced `variants` times. */
  prompts: string[];
  aspect: ClipAspect;
  duration: number;
  resolution: string;
  variants: number;
  reference?: ClipReference;
};

export type ClipCostEstimate = {
  clips: number;
  secondsEach: number;
  secondsTotal: number;
  perClipUsd: number;
  totalUsd: number;
  /** Rounded up, so the budget never under-counts. */
  totalCents: number;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Dollars as people write them: two decimals, three below a cent. */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`;
}

export function clipCount(req: Pick<ClipRequest, "prompts" | "variants">): number {
  return req.prompts.length * req.variants;
}

export function estimateClipCost(
  caps: Pick<ClipCapabilities, "prices" | "defaultResolution">,
  req: Pick<ClipRequest, "prompts" | "variants" | "duration" | "resolution">,
): ClipCostEstimate {
  const rate = caps.prices[req.resolution] ?? caps.prices[caps.defaultResolution] ?? 0;
  const clips = clipCount(req);
  const perClipUsd = rate * req.duration;
  const totalUsd = perClipUsd * clips;
  return {
    clips,
    secondsEach: req.duration,
    secondsTotal: req.duration * clips,
    perClipUsd,
    totalUsd,
    totalCents: Math.ceil(totalUsd * 100 - 1e-9),
  };
}

/** Cents one clip costs, for reserving against the daily budget as each is submitted. */
export const clipCents = (
  caps: Pick<ClipCapabilities, "prices" | "defaultResolution">,
  duration: number,
  resolution: string,
): number => estimateClipCost(caps, { prompts: [""], variants: 1, duration, resolution }).totalCents;

export type NormalizedClip =
  | { ok: true; value: ClipRequest }
  | { ok: false; error: string };

const bad = (error: string): NormalizedClip => ({ ok: false, error });

/** The data URL a browser makes of a chosen file, or the bare base64, plus its type. */
function readReference(raw: unknown): ClipReference | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!isObject(raw)) return "invalid";
  const mime = String(raw.mime ?? "").toLowerCase().replace("image/jpg", "image/jpeg");
  const data = typeof raw.data === "string" ? raw.data.replace(/^data:[^,]*,/, "").trim() : "";
  if (!(REFERENCE_TYPES as readonly string[]).includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return "invalid";
  }
  return { mime: mime as ClipReference["mime"], data };
}

/**
 * Check a request against what the provider supports and fill in defaults.
 * An unsupported value is refused, never rounded: a 7 second clip silently
 * billed as 8 is the kind of surprise this exists to prevent.
 */
export function normalizeClipRequest(caps: ClipCapabilities, raw: unknown): NormalizedClip {
  if (!isObject(raw)) return bad("Send a JSON object.");

  const prompts = (Array.isArray(raw.prompts) ? raw.prompts : [])
    .map((p) => (typeof p === "string" ? p.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean);
  if (prompts.length === 0) return bad("Write at least one clip prompt.");
  if (prompts.length > MAX_PROMPTS) return bad(`Use at most ${MAX_PROMPTS} prompts per run.`);
  if (prompts.some((p) => p.length > MAX_PROMPT_CHARS)) {
    return bad(`Keep each prompt under ${MAX_PROMPT_CHARS} characters.`);
  }

  const aspect = String(raw.aspect ?? caps.aspects[0]) as ClipAspect;
  if (!caps.aspects.includes(aspect)) {
    return bad(
      `${caps.label} does not offer ${ASPECT_LABELS[aspect] ?? String(raw.aspect)}. Choose ${caps.aspects
        .map((a) => ASPECT_LABELS[a])
        .join(" or ")}.`,
    );
  }

  const duration = Number(raw.duration ?? caps.durations[0]);
  if (!caps.durations.includes(duration)) {
    return bad(`${caps.label} accepts clips of ${caps.durations.join(", ")} seconds, not ${String(raw.duration)}.`);
  }

  const resolution = String(raw.resolution ?? caps.defaultResolution);
  if (!caps.resolutions.some((r) => r.id === resolution)) {
    return bad(`${caps.label} offers ${caps.resolutions.map((r) => r.id).join(", ")}, not ${resolution}.`);
  }

  const variants = Number(raw.variants ?? 1);
  if (!Number.isInteger(variants) || variants < 1 || variants > caps.maxVariants) {
    return bad(`Choose between 1 and ${caps.maxVariants} variants of each prompt.`);
  }
  if (prompts.length * variants > caps.maxClips) {
    return bad(`That is ${prompts.length * variants} clips; the most for one run is ${caps.maxClips}.`);
  }

  const reference = readReference(raw.reference);
  if (reference === "invalid") return bad("The reference image must be a JPEG, PNG or WebP picture.");
  if (reference && !caps.referenceImage) {
    return bad(`${caps.label} cannot start a clip from a reference image.`);
  }
  if (reference && Math.ceil((reference.data.length * 3) / 4) > MAX_REFERENCE_BYTES) {
    return bad(`Use a reference image under ${Math.round(MAX_REFERENCE_BYTES / 1024 / 1024)} MB.`);
  }

  return {
    ok: true,
    value: { prompts, aspect, duration, resolution, variants, ...(reference ? { reference } : {}) },
  };
}

/** Pixel size for the providers that take WxH: a 720p landscape clip is 1280x720. */
export function pixelSize(aspect: ClipAspect, resolution: string): string | null {
  const high = /^(1080p|1792)/i.test(resolution);
  const sizes: Record<ClipAspect, [string, string]> = {
    "16:9": ["1280x720", "1792x1024"],
    "9:16": ["720x1280", "1024x1792"],
    "1:1": ["720x720", "1080x1080"],
  };
  return sizes[aspect]?.[high ? 1 : 0] ?? null;
}

/* ---------------------------------------------------------------------- */
/* Provider contract                                                       */
/* ---------------------------------------------------------------------- */

export type RemoteStatus = "queued" | "in_progress" | "completed" | "failed";

/** A failure the provider reported, as opposed to one of the transport. */
export type RemoteFailure = {
  code?: string;
  message: string;
  /** The provider refused on content grounds. Rewording is the fix, not retrying. */
  moderation?: boolean;
};

export type RemoteJob = {
  id: string;
  status: RemoteStatus;
  /** 0 to 100 when the provider says. */
  progress?: number;
  error?: RemoteFailure;
  /** A finished clip that arrived inline with the reply, for providers with no separate download. */
  inline?: Uint8Array;
};

export type ProviderCall = { signal?: AbortSignal };

/**
 * One video backend. Providers know their own wire format and nothing else:
 * retries, polling, budget and storage belong to the runner, so adding Runway,
 * Luma or Kling later means one new file that implements this.
 */
export interface VideoProvider {
  readonly kind: ClipProviderKind;
  capabilities(): ClipCapabilities;
  /** Submit one clip. May return an already finished job. */
  start(req: ClipRequest, prompt: string, call?: ProviderCall): Promise<RemoteJob>;
  /** Ask where an unfinished job is. */
  poll(id: string, call?: ProviderCall): Promise<RemoteJob>;
  /** Write the finished MP4 to `dest`, refusing anything past `maxBytes`. */
  download(job: RemoteJob, dest: string, maxBytes: number, call?: ProviderCall): Promise<number>;
  /** Save a still of the clip when the provider makes one. Returns false when it does not. */
  poster?(job: RemoteJob, dest: string, maxBytes: number, call?: ProviderCall): Promise<boolean>;
  /** Delete the remote asset or stop the job. Best effort. */
  remove?(id: string, call?: ProviderCall): Promise<void>;
}

/** What went wrong, in words a person can act on. */
export class VideoClipError extends Error {
  constructor(
    message: string,
    readonly detail: { code?: string; moderation?: boolean; status?: number; cancelled?: boolean } = {},
  ) {
    super(message);
    this.name = "VideoClipError";
  }
}

export class VideoNotConfiguredError extends Error {
  constructor() {
    super(NO_VIDEO_MODEL_MESSAGE);
    this.name = "VideoNotConfiguredError";
  }
}

export const NO_VIDEO_MODEL_MESSAGE =
  "No video model is configured. Set AI_VIDEO_PROVIDER=gemini with GEMINI_API_KEY, or point AI_VIDEO_BASE_URL or AZURE_OPENAI_VIDEO_DEPLOYMENT at a model that serves the Videos API. See docs/video-clips.md.";

export const VIDEO_SETUP_URL = "https://github.com/russrimm/InfiniAIBook/blob/main/docs/video-clips.md";
