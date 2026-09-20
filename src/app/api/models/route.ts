import { db } from "@/lib/db";
import { ok, fail } from "@/lib/http";
import {
  PROVIDER,
  authHeaders,
  chatModel,
  embedModel,
  imageModel,
  visionModel,
  envChatModel,
  envEmbedModel,
  envImageModel,
  envVisionModel,
  getClient,
} from "@/lib/ai";
import {
  getSetting,
  setSetting,
  SETTING_CHAT_MODEL,
  SETTING_EMBED_MODEL,
  SETTING_IMAGE_MODEL,
  SETTING_VISION_MODEL,
} from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ModelInfo = { id: string; kind: "chat" | "embedding" | "image" };

const EMBED_HINT = /embed|embedding|bge|gte|e5[-_]|minilm|nomic/i;
const IMAGE_HINT = /gpt-image|dall-?e|flux|stable-?diffusion|imagen|sdxl/i;
/** Not usable for chat, retrieval or stills, so not worth offering. */
const EXCLUDE_HINT = /whisper|tts|moderation|sora|speech|transcribe/i;

function classify(id: string): ModelInfo | null {
  if (EXCLUDE_HINT.test(id)) return null;
  if (IMAGE_HINT.test(id)) return { id, kind: "image" };
  return { id, kind: EMBED_HINT.test(id) ? "embedding" : "chat" };
}

/**
 * Azure's data plane lists every model available in the region, which is not
 * the same as what this resource can actually serve. Only deployments can be
 * called, and they are exposed on an older api-version than the one used for
 * inference.
 */
async function azureDeployments(): Promise<ModelInfo[]> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
  if (!endpoint) return [];

  const res = await fetch(
    `${endpoint}/openai/deployments?api-version=2023-03-15-preview`,
    { headers: { ...(await authHeaders()), "content-type": "application/json" } }
  );
  if (!res.ok) throw new Error(`Azure returned ${res.status} listing deployments`);

  const j = (await res.json()) as {
    data?: { id?: string; model?: string; status?: string }[];
  };
  return (j.data ?? [])
    .filter((d) => d.id && d.status !== "failed")
    .map((d) => classify(d.id as string))
    .filter((m): m is ModelInfo => m !== null);
}

/** Every OpenAI-compatible server exposes /v1/models. */
async function openAiModels(): Promise<ModelInfo[]> {
  const list = await getClient().models.list();
  const out: ModelInfo[] = [];
  for await (const m of list) {
    const info = classify(m.id);
    if (info) out.push(info);
  }
  return out;
}

export async function GET() {
  try {
    let models: ModelInfo[] = [];
    let discoveryError: string | null = null;

    try {
      models = PROVIDER === "azure" ? await azureDeployments() : await openAiModels();
    } catch (e) {
      discoveryError = e instanceof Error ? e.message : "Could not list models";
    }

    const current = {
      chat: chatModel(),
      embedding: embedModel(),
      image: imageModel(),
      vision: visionModel(),
    };

    // The configured models must always be selectable, even when discovery
    // fails or the provider omits them.
    for (const [id, kind] of [
      [current.chat, "chat"],
      [current.embedding, "embedding"],
      [current.image, "image"],
      [current.vision, "chat"],
    ] as const) {
      if (!models.some((m) => m.id === id)) models.push({ id, kind });
    }

    // How many chunks each embedding model owns, so switching can warn about
    // the re-embedding it implies.
    const usage = db
      .prepare(
        `SELECT embed_model AS model, COUNT(*) AS n
           FROM chunks WHERE embedding IS NOT NULL GROUP BY embed_model`
      )
      .all() as unknown as { model: string | null; n: number }[];

    const embeddedChunks = usage.reduce((s, r) => s + r.n, 0);
    const staleIfSwitched = usage
      .filter((r) => r.model !== current.embedding)
      .reduce((s, r) => s + r.n, 0);

    return ok({
      provider: PROVIDER,
      current,
      env: {
        chat: envChatModel(),
        embedding: envEmbedModel(),
        image: envImageModel(),
        vision: envVisionModel(),
      },
      overridden: {
        chat: getSetting(SETTING_CHAT_MODEL) !== null,
        embedding: getSetting(SETTING_EMBED_MODEL) !== null,
        image: getSetting(SETTING_IMAGE_MODEL) !== null,
        vision: getSetting(SETTING_VISION_MODEL) !== null,
      },
      chat: models.filter((m) => m.kind === "chat").map((m) => m.id).sort(),
      embedding: models.filter((m) => m.kind === "embedding").map((m) => m.id).sort(),
      image: models.filter((m) => m.kind === "image").map((m) => m.id).sort(),
      embeddedChunks,
      staleChunks: staleIfSwitched,
      discoveryError,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      chat?: string | null;
      embedding?: string | null;
      image?: string | null;
      vision?: string | null;
    };

    if (body.chat !== undefined) {
      // null resets to whatever the environment specifies.
      setSetting(SETTING_CHAT_MODEL, body.chat);
    }
    if (body.embedding !== undefined) {
      setSetting(SETTING_EMBED_MODEL, body.embedding);
    }
    if (body.image !== undefined) {
      setSetting(SETTING_IMAGE_MODEL, body.image);
    }
    if (body.vision !== undefined) {
      setSetting(SETTING_VISION_MODEL, body.vision);
    }

    const current = {
      chat: chatModel(),
      embedding: embedModel(),
      image: imageModel(),
      vision: visionModel(),
    };

    // Changing the embedding model leaves stored vectors incomparable; report
    // how much is affected rather than letting retrieval quietly degrade.
    const stale = db
      .prepare(
        `SELECT COUNT(*) AS n FROM chunks
          WHERE embedding IS NOT NULL AND (embed_model IS NULL OR embed_model != ?)`
      )
      .get(current.embedding) as unknown as { n: number };

    return ok({ current, staleChunks: stale.n ?? 0 });
  } catch (e) {
    return fail(e);
  }
}
