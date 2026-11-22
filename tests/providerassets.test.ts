/**
 * Links a model provider returns (a generated image, a rendered avatar video,
 * a job summary) are fetched like any other untrusted address.
 *
 * undici's fetch is replaced by a script of canned responses and the name
 * lookup is mocked, so each test controls what the "remote" site says and can
 * see which URLs were actually requested. A destination the guard refuses must
 * never show up in that list.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ default: { lookup: dnsLookup } }));

const undiciFetch = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: undiciFetch,
}));

import { ProviderAssetError, downloadProviderAsset, openProviderAsset } from "@/lib/providerfetch";
import { avatarFailureReason, downloadAvatarResult, type AvatarJob } from "@/lib/avatarbatch";

const PUBLIC_IP = "93.184.215.14";
const MB = 1024 * 1024;
const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const bytes = (n: number) => new Response(new Uint8Array(n).fill(7));

/** Answer each undici request in turn; the last step repeats. */
function script(...steps: (Response | ((url: string) => Response))[]) {
  let i = 0;
  undiciFetch.mockImplementation(async (url: string) => {
    const step = steps[Math.min(i++, steps.length - 1)];
    return typeof step === "function" ? step(url) : step.clone();
  });
}
const requested = () => undiciFetch.mock.calls.map((c) => String(c[0]));

const globalFetch = vi.fn();

beforeEach(() => {
  undiciFetch.mockReset();
  globalFetch.mockReset();
  dnsLookup.mockReset();
  dnsLookup.mockImplementation(async (host: string) => {
    if (host === "internal.test") return [{ address: "10.1.2.3", family: 4 }];
    if (host === "metadata.test") return [{ address: "169.254.169.254", family: 4 }];
    if (host === "localhost") return [{ address: "127.0.0.1", family: 4 }];
    return [{ address: PUBLIC_IP, family: 4 }];
  });
  vi.stubGlobal("fetch", globalFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const asset = { what: "generated image", maxBytes: 1 * MB };

describe("downloadProviderAsset", () => {
  it("downloads a file from a public host, without any credential", async () => {
    script(bytes(1000));
    const buf = await downloadProviderAsset("https://images.example.test/a.png", asset);
    expect(buf).toHaveLength(1000);
    expect(requested()).toEqual(["https://images.example.test/a.png"]);
    const init = undiciFetch.mock.calls[0][1] as { headers?: unknown };
    expect(init.headers).toBeUndefined();
  });

  it.each([
    ["loopback", "http://127.0.0.1:8080/secret.png"],
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data/iam/security-credentials/"],
    ["an IPv6 loopback", "http://[::1]/x.png"],
    ["a private network address", "https://10.0.0.5/x.png"],
    ["a name that resolves to a private address", "https://internal.test/x.png"],
    ["a name that resolves to the metadata address", "https://metadata.test/x.png"],
  ])("refuses a link to %s and never requests it", async (_label, url) => {
    script(bytes(10));
    const failure = downloadProviderAsset(url, asset);
    await expect(failure).rejects.toBeInstanceOf(ProviderAssetError);
    await expect(failure).rejects.toThrow(/not downloaded/);
    expect(requested()).toEqual([]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("follows a redirect to another public host, and refuses one into the private network", async () => {
    script(redirect("https://cdn.example.test/final.png"), bytes(10));
    expect(await downloadProviderAsset("https://images.example.test/a.png", asset)).toHaveLength(10);
    expect(requested()).toEqual(["https://images.example.test/a.png", "https://cdn.example.test/final.png"]);

    undiciFetch.mockReset();
    script(redirect("http://169.254.169.254/latest/meta-data/"), bytes(10));
    await expect(downloadProviderAsset("https://images.example.test/a.png", asset)).rejects.toThrow(/not downloaded/);
    expect(requested()).toEqual(["https://images.example.test/a.png"]);
  });

  it("refuses a body over the size limit, declared or not", async () => {
    // Fresh responses each time: cancelling one branch of a clone waits for the other.
    script(() => new Response(new Uint8Array(10), { headers: { "content-length": String(5 * MB) } }));
    await expect(downloadProviderAsset("https://images.example.test/a.png", asset)).rejects.toThrow(
      /larger than 1 MB/,
    );

    undiciFetch.mockReset();
    script(() => bytes(3 * MB));
    await expect(downloadProviderAsset("https://images.example.test/b.png", asset)).rejects.toThrow(
      /larger than 1 MB/,
    );
  });

  it("reports an error status and a link that is not https when asked for https only", async () => {
    script(new Response("nope", { status: 404 }));
    await expect(downloadProviderAsset("https://images.example.test/a.png", asset)).rejects.toMatchObject({
      status: 404,
      message: expect.stringContaining("404"),
    });
    await expect(
      downloadProviderAsset("http://images.example.test/a.png", { ...asset, httpsOnly: true }),
    ).rejects.toThrow(/only https/);
    await expect(downloadProviderAsset("not a url", asset)).rejects.toThrow(/not a web address/);
  });

  it("allows the operator's own endpoint, even on a private network, but not a redirect out of it", async () => {
    globalFetch.mockResolvedValueOnce(bytes(50));
    const trusted = { ...asset, trusted: ["http://127.0.0.1:11434/v1"] };
    expect(await downloadProviderAsset("http://127.0.0.1:11434/images/a.png", trusted)).toHaveLength(50);
    expect(requested()).toEqual([]);

    globalFetch.mockReset();
    globalFetch.mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data/"));
    await expect(downloadProviderAsset("http://127.0.0.1:11434/images/a.png", trusted)).rejects.toThrow(
      /not downloaded/,
    );
    expect(requested()).toEqual([]);

    globalFetch.mockReset();
    globalFetch.mockResolvedValueOnce(redirect("https://cdn.example.test/final.png"));
    script(bytes(20));
    expect(await downloadProviderAsset("http://127.0.0.1:11434/images/a.png", trusted)).toHaveLength(20);
    expect(requested()).toEqual(["https://cdn.example.test/final.png"]);
  });

  it("does not trust a different port or host on the same machine", async () => {
    script(bytes(10));
    const trusted = { ...asset, trusted: ["http://127.0.0.1:11434/v1"] };
    await expect(downloadProviderAsset("http://127.0.0.1:9999/a.png", trusted)).rejects.toThrow(/not downloaded/);
    await expect(downloadProviderAsset("http://localhost:11434/a.png", trusted)).rejects.toThrow(/not downloaded/);
  });

  it("stops waiting for a response that never starts", async () => {
    vi.useFakeTimers();
    try {
      undiciFetch.mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
      );
      const pending = openProviderAsset("https://slow.example.test/a.png", { ...asset, headersTimeoutMs: 5000 });
      const settled = expect(pending).rejects.toThrow(/no response within 5 seconds/);
      await vi.advanceTimersByTimeAsync(5001);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("avatar results", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "avatar-result-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("saves a finished render from a public blob link", async () => {
    script(bytes(4096));
    const file = path.join(dir, "out.mp4");
    expect(await downloadAvatarResult("https://acct.blob.core.windows.net/out/1.mp4?sig=x", file)).toBe(4096);
    expect(fs.statSync(file).size).toBe(4096);
    expect(fs.existsSync(`${file}.part`)).toBe(false);
  });

  it("refuses a result link into the private network, and leaves no file", async () => {
    script(bytes(10));
    const file = path.join(dir, "out.mp4");
    for (const url of ["https://127.0.0.1/out.mp4", "https://169.254.169.254/latest/meta-data/", "https://internal.test/o.mp4"]) {
      await expect(downloadAvatarResult(url, file)).rejects.toThrow(/not downloaded/);
    }
    await expect(downloadAvatarResult("http://acct.blob.core.windows.net/out.mp4", file)).rejects.toThrow(
      /unexpected result link/,
    );
    expect(requested()).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses a result link that redirects into the private network", async () => {
    script(redirect("https://169.254.169.254/latest/meta-data/"), bytes(10));
    await expect(downloadAvatarResult("https://acct.blob.core.windows.net/o.mp4", path.join(dir, "o.mp4"))).rejects.toThrow(
      /not downloaded/,
    );
    expect(requested()).toEqual(["https://acct.blob.core.windows.net/o.mp4"]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("reads the failure reason from a public summary, and ignores a private one", async () => {
    const summary = (url: string): AvatarJob => ({ status: "Failed", outputs: { summary: url } }) as AvatarJob;
    script(Response.json({ results: [{ error: "Voice not supported" }] }));
    expect(await avatarFailureReason(summary("https://acct.blob.core.windows.net/s.json"))).toBe("Voice not supported");

    undiciFetch.mockReset();
    script(Response.json({ results: [{ error: "should not be read" }] }));
    expect(await avatarFailureReason(summary("https://169.254.169.254/latest/meta-data/"))).toMatch(
      /failed without a reason/,
    );
    expect(requested()).toEqual([]);
  });
});

describe("generated images returned as a link", () => {
  const apiReply = (url: string) => Response.json({ data: [{ url }] });

  /** ai.ts reads its provider settings when it loads. */
  async function loadAi() {
    vi.resetModules();
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("DAILY_BUDGET_USD", "0");
    return (await import("@/lib/ai")).generateImage;
  }

  it("downloads an image from a public host", async () => {
    const generate = await loadAi();
    globalFetch.mockResolvedValueOnce(apiReply("https://oaidalleapiprodscus.blob.core.windows.net/img/1.png"));
    script(bytes(2048));
    const image = await generate("a lighthouse", { size: "1024x1024" });
    expect(image.png).toHaveLength(2048);
    expect(requested()).toEqual(["https://oaidalleapiprodscus.blob.core.windows.net/img/1.png"]);
  });

  it("refuses a link to the metadata service or the private network, without retrying", async () => {
    const generate = await loadAi();
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8080/admin", "https://internal.test/x.png"]) {
      globalFetch.mockReset();
      globalFetch.mockResolvedValue(apiReply(url));
      script(bytes(10));
      await expect(generate("a lighthouse", { size: "1024x1024" })).rejects.toThrow(/not downloaded/);
      expect(globalFetch).toHaveBeenCalledTimes(1);
      expect(requested()).toEqual([]);
    }
  });

  it("refuses a link that redirects into the private network", async () => {
    const generate = await loadAi();
    globalFetch.mockResolvedValueOnce(apiReply("https://images.example.test/1.png"));
    script(redirect("http://169.254.169.254/latest/meta-data/"), bytes(10));
    await expect(generate("a lighthouse", { size: "1024x1024" })).rejects.toThrow(/not downloaded/);
    expect(requested()).toEqual(["https://images.example.test/1.png"]);
  });

  it("still takes an image the operator's own local server hosts itself", async () => {
    vi.resetModules();
    vi.stubEnv("AI_PROVIDER", "");
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:8080/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("DAILY_BUDGET_USD", "0");
    const { generateImage: generate } = await import("@/lib/ai");
    globalFetch
      .mockResolvedValueOnce(apiReply("http://127.0.0.1:8080/files/1.png"))
      .mockResolvedValueOnce(bytes(512));
    const image = await generate("a lighthouse", { size: "1024x1024" });
    expect(image.png).toHaveLength(512);
    expect(requested()).toEqual([]);
  });
});
