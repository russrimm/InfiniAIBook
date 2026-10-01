import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupSchema, resolveSetup } from "@/lib/setup";
import { startCall } from "@/lib/server/realtime";
import { ProviderError, NotConfiguredError, provider } from "@/lib/server/provider";

const s = resolveSetup(SetupSchema.parse({ target: "fr", support: "en", level: "A2", scenario: "market" }));
const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n";
const ANSWER = "v=0\r\no=- 3 4 IN IP4 10.0.0.1\r\n";

const ENV_KEYS = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_REALTIME_DEPLOYMENT",
  "AZURE_OPENAI_TRANSCRIPTION_MODEL",
  "OPENAI_API_KEY",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("provider", () => {
  it("requires a provider", () => {
    expect(() => provider()).toThrow(NotConfiguredError);
  });

  it("normalizes the Azure endpoint to the v1 API", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://res.openai.azure.com/some/path/";
    expect(provider().baseUrl).toBe("https://res.openai.azure.com/openai/v1");
  });

  it("sends realtime calls to the openai.azure.com host of a Foundry resource", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://russ.services.ai.azure.com";
    expect(provider().baseUrl).toBe("https://russ.services.ai.azure.com/openai/v1");
    expect(provider().realtimeBaseUrl).toBe("https://russ.openai.azure.com/openai/v1");
    process.env.AZURE_OPENAI_ENDPOINT = "https://russ.cognitiveservices.azure.com/";
    expect(provider().realtimeBaseUrl).toBe("https://russ.openai.azure.com/openai/v1");
    process.env.AZURE_OPENAI_ENDPOINT = "https://gw.example.com";
    expect(provider().realtimeBaseUrl).toBe("https://gw.example.com/openai/v1");
  });

  it("refuses plain http", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "http://res.openai.azure.com";
    expect(() => provider()).toThrow(/https/);
  });
});

describe("startCall", () => {
  it("mints a secret server-side, then exchanges SDP with it", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://res.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "server-key";
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = "gpt-realtime";
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/realtime/client_secrets")) {
        return new Response(JSON.stringify({ value: "ek_123", expires_at: 0 }), { status: 200 });
      }
      if (url.endsWith("/realtime/calls")) {
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ek_123");
        expect(init.body).toBe(OFFER);
        return new Response(ANSWER, { status: 201 });
      }
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCall(s, OFFER)).resolves.toBe(ANSWER);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://res.openai.azure.com/openai/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("server-key");
    const body = JSON.parse(init.body as string);
    expect(body.session).toMatchObject({ type: "realtime", model: "gpt-realtime" });
    expect(body.session.audio.output.voice).toBe("shimmer");
    expect(body.session.audio.input.transcription.model).toBe("gpt-4o-mini-transcribe");
    expect(body.session.instructions).toContain("French");
  });

  it("names the missing realtime deployment", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://russ.services.ai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "k";
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = "gpt-realtime-2.1";
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "OpperationNotSupported", message: "The realtime operation does not work with the specified model." } }),
          { status: 400 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(startCall(s, OFFER)).rejects.toThrow(/realtime model "gpt-realtime-2.1" isn't available.*wait about five minutes/);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://russ.openai.azure.com/openai/v1/realtime/client_secrets"
    );
  });

  it("explains a credential failure", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://res.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "bad";
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = "gpt-realtime";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 401 })));
    const err = await startCall(s, OFFER).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toMatch(/Cognitive Services OpenAI User/);
  });

  it("uses OpenAI when no Azure endpoint is set, and honors transcription off", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = "gpt-realtime";
    process.env.AZURE_OPENAI_TRANSCRIPTION_MODEL = "off";
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("client_secrets")
        ? new Response(JSON.stringify({ value: "ek" }), { status: 200 })
        : new Response(ANSWER, { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await startCall(s, OFFER);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body as string).session.audio.input.transcription).toBeUndefined();
  });

  it("rejects a non-SDP answer", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://res.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "k";
    process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT = "gpt-realtime";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("client_secrets")
          ? new Response(JSON.stringify({ value: "ek" }), { status: 200 })
          : new Response("<html>", { status: 200 })
      )
    );
    await expect(startCall(s, OFFER)).rejects.toThrow(/invalid SDP/);
  });
});
