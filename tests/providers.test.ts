import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_PRESETS, resolveEndpoint } from "@/lib/providers";

const KEYS = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "AI_EMBEDDING_PROVIDER",
  "AI_EMBEDDING_API_KEY",
];

beforeEach(() => {
  for (const k of KEYS) vi.stubEnv(k, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PROVIDER_PRESETS", () => {
  it("gives every preset an http(s) base URL", () => {
    for (const [name, preset] of Object.entries(PROVIDER_PRESETS)) {
      expect(preset.baseURL, name).toMatch(/^https?:\/\//);
    }
  });

  it("marks local runtimes as keyless and hosted ones with a key variable", () => {
    for (const [name, preset] of Object.entries(PROVIDER_PRESETS)) {
      if (preset.local) expect(preset.keyEnv, name).toBeUndefined();
      else expect(preset.keyEnv, name).toMatch(/_API_KEY$/);
    }
  });
});

describe("resolveEndpoint", () => {
  it("reports nothing configured when no variable is set", () => {
    expect(resolveEndpoint("AI")).toEqual({
      name: null,
      label: "Azure OpenAI",
      baseURL: null,
      apiKey: undefined,
      preset: null,
    });
  });

  it("uses a preset's base URL and its conventional key variable", () => {
    vi.stubEnv("AI_PROVIDER", "Groq");
    vi.stubEnv("GROQ_API_KEY", "  gsk-123  ");
    const r = resolveEndpoint("AI");
    expect(r.name).toBe("groq");
    expect(r.label).toBe("Groq");
    expect(r.baseURL).toBe(PROVIDER_PRESETS.groq.baseURL);
    expect(r.apiKey).toBe("gsk-123");
  });

  it("lets explicit variables override the preset", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_BASE_URL", "https://proxy.example/v1");
    vi.stubEnv("AI_API_KEY", "explicit");
    vi.stubEnv("GROQ_API_KEY", "from-preset");
    const r = resolveEndpoint("AI");
    expect(r.name).toBe("groq");
    expect(r.baseURL).toBe("https://proxy.example/v1");
    expect(r.apiKey).toBe("explicit");
  });

  it("treats a bare base URL as a custom OpenAI-compatible endpoint", () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:9000/v1");
    const r = resolveEndpoint("AI");
    expect(r).toMatchObject({ name: "custom", label: "OpenAI-compatible", preset: null });
  });

  it("warns about an unknown provider but not about azure", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("AI_PROVIDER", "azure");
    expect(resolveEndpoint("AI").name).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("AI_PROVIDER", "nope");
    expect(resolveEndpoint("AI").name).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('AI_PROVIDER="nope"');
  });

  it("resolves other prefixes independently of the main provider", () => {
    vi.stubEnv("AI_PROVIDER", "groq");
    vi.stubEnv("AI_EMBEDDING_PROVIDER", "openai");
    vi.stubEnv("OPENAI_API_KEY", "sk-embed");
    const r = resolveEndpoint("AI_EMBEDDING");
    expect(r.name).toBe("openai");
    expect(r.apiKey).toBe("sk-embed");
  });
});
