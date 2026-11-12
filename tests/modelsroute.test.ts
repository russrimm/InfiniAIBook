import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/models/route";
import { db } from "@/lib/db";
import { getSetting, setSetting, SETTING_CHAT_MODEL, SETTING_EMBED_MODEL } from "@/lib/settings";
import { request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

const state = vi.hoisted(() => ({
  provider: "openai" as "openai" | "azure",
  models: { list: vi.fn() },
  authHeaders: vi.fn(),
}));

// PROVIDER is a constant in the real module; the proxy lets each test choose one.
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === "PROVIDER") return state.provider;
      if (prop === "getClient") return () => ({ models: state.models });
      if (prop === "authHeaders") return state.authHeaders;
      return Reflect.get(target, prop, receiver);
    },
  });
});

const ENV_KEYS = ["AZURE_OPENAI_ENDPOINT", "AI_MODEL", "AI_EMBEDDING_MODEL"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const listing = (...ids: string[]) =>
  (async function* () {
    for (const id of ids) yield { id };
  })();

beforeEach(() => {
  resetNotebooks();
  setSetting(SETTING_CHAT_MODEL, null);
  setSetting(SETTING_EMBED_MODEL, null);
  state.provider = "openai";
  state.models.list.mockReset();
  state.authHeaders.mockReset().mockResolvedValue({ authorization: "Bearer token" });
  delete process.env.AI_MODEL;
  delete process.env.AI_EMBEDDING_MODEL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const get = async () => (await GET()).json();
const post = (body: unknown) => POST(request("/api/models", "POST", body));

describe("GET /api/models with an OpenAI-compatible provider", () => {
  it("sorts the provider's models into chat, embedding and image lists and drops audio models", async () => {
    process.env.AI_MODEL = "gpt-test";
    state.models.list.mockResolvedValue(
      listing("gpt-test", "text-embedding-3-small", "gpt-image-1", "whisper-1", "tts-1", "omni-moderation-latest", "bge-m3"),
    );
    const body = await get();
    expect(body.provider).toBe("openai");
    expect(body.discoveryError).toBeNull();
    expect(body.chat).toContain("gpt-test");
    expect(body.embedding).toEqual(expect.arrayContaining(["text-embedding-3-small", "bge-m3"]));
    expect(body.image).toContain("gpt-image-1");
    for (const list of [body.chat, body.embedding, body.image]) {
      expect(list).not.toContain("whisper-1");
      expect(list).not.toContain("tts-1");
      expect(list).not.toContain("omni-moderation-latest");
    }
    expect([...body.embedding]).toEqual([...body.embedding].sort());
  });

  it("keeps the configured models selectable when discovery fails, and says why", async () => {
    process.env.AI_MODEL = "configured-chat";
    state.models.list.mockRejectedValue(new Error("connection refused"));
    const body = await get();
    expect(body.discoveryError).toBe("connection refused");
    expect(body.chat).toContain("configured-chat");
    expect(body.embedding).toContain(body.current.embedding);
    expect(body.image).toContain(body.current.image);
  });

  it("adds a configured model the provider did not list", async () => {
    process.env.AI_MODEL = "private-model";
    state.models.list.mockResolvedValue(listing("other"));
    const body = await get();
    expect(body.chat).toEqual(expect.arrayContaining(["other", "private-model"]));
  });

  it("separates the saved choice from the environment default", async () => {
    process.env.AI_MODEL = "env-chat";
    setSetting(SETTING_CHAT_MODEL, "saved-chat");
    state.models.list.mockResolvedValue(listing());
    const body = await get();
    expect(body.current.chat).toBe("saved-chat");
    expect(body.env.chat).toBe("env-chat");
    expect(body.overridden).toEqual({ chat: true, embedding: false, image: false, vision: false });
  });

  it("counts embedded chunks and the ones a switch would leave stale", async () => {
    const nb = seedNotebook();
    seedSource(nb, { embedding: [1, 0], embedModel: "old-embed" });
    seedSource(nb, { embedding: [1, 0], embedModel: "old-embed" });
    seedSource(nb, { embedding: [1, 0], embedModel: "new-embed" });
    seedSource(nb);
    process.env.AI_EMBEDDING_MODEL = "new-embed";
    state.models.list.mockResolvedValue(listing());
    const body = await get();
    expect(body.embeddedChunks).toBe(3);
    expect(body.staleChunks).toBe(2);
  });
});

describe("GET /api/models with Azure OpenAI", () => {
  beforeEach(() => {
    state.provider = "azure";
    state.models.list.mockResolvedValue(listing("never-used"));
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com/";
  });

  it("lists deployments, skips failed ones and calls the deployments endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "chat-deploy", status: "succeeded" },
            { id: "embed-deploy-embedding", status: "succeeded" },
            { id: "broken", status: "failed" },
            { id: "whisper", status: "succeeded" },
            { model: "no-id" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const body = await get();
    expect(body.provider).toBe("azure");
    expect(body.discoveryError).toBeNull();
    expect(body.chat).toContain("chat-deploy");
    expect(body.chat).not.toContain("broken");
    expect(body.chat).not.toContain("whisper");
    expect(body.chat).not.toContain("never-used");
    expect(body.embedding).toContain("embed-deploy-embedding");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.openai.azure.com/openai/deployments?api-version=2023-03-15-preview");
    expect(init.headers.authorization).toBe("Bearer token");
  });

  it("reports an Azure error status as a discovery problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).discoveryError).toBe("Azure returned 403 listing deployments");
  });

  it("offers only the configured models when no endpoint is set", async () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const body = await get();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.discoveryError).toBeNull();
    expect(body.chat).toEqual([body.current.chat]);
  });
});

describe("POST /api/models", () => {
  it("saves a chosen model and returns the models now in effect", async () => {
    const res = await post({ chat: "my-chat", embedding: "my-embed" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current).toMatchObject({ chat: "my-chat", embedding: "my-embed" });
    expect(getSetting(SETTING_CHAT_MODEL)).toBe("my-chat");
  });

  it("resets a model to the environment default with null or an empty string", async () => {
    process.env.AI_MODEL = "env-chat";
    await post({ chat: "saved" });
    const res = await post({ chat: null });
    expect((await res.json()).current.chat).toBe("env-chat");
    expect(getSetting(SETTING_CHAT_MODEL)).toBeNull();

    await post({ chat: "saved again" });
    await post({ chat: "" });
    expect(getSetting(SETTING_CHAT_MODEL)).toBeNull();
  });

  it("leaves models that are not in the request alone", async () => {
    await post({ chat: "keep-me" });
    await post({ embedding: "other-embed" });
    expect(getSetting(SETTING_CHAT_MODEL)).toBe("keep-me");
  });

  it("warns how many vectors a new embedding model leaves incomparable", async () => {
    const nb = seedNotebook();
    seedSource(nb, { embedding: [1, 0], embedModel: "old-embed" });
    seedSource(nb, { embedding: [1, 0], embedModel: "old-embed" });
    seedSource(nb, { embedding: [1, 0], embedModel: "new-embed" });
    const body = await (await post({ embedding: "new-embed" })).json();
    expect(body.staleChunks).toBe(2);
    const same = await (await post({ embedding: "old-embed" })).json();
    expect(same.staleChunks).toBe(1);
  });

  it("returns 500 for a body that is not JSON", async () => {
    const res = await POST(request("/api/models", "POST", "{nope"));
    expect(res.status).toBe(500);
    expect(await res.json()).toHaveProperty("error");
  });

  it("stores settings in the database, not the environment", async () => {
    await post({ chat: "persisted" });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTING_CHAT_MODEL) as unknown as {
      value: string;
    };
    expect(row.value).toBe("persisted");
    expect(process.env.AI_MODEL).toBeUndefined();
  });
});
