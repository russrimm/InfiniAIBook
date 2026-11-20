import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ai.ts reads its provider configuration at import time.
vi.hoisted(() => {
  process.env.AI_PROVIDER = "azure";
  process.env.AZURE_OPENAI_ENDPOINT = "https://example-resource.openai.azure.com";
  process.env.AZURE_OPENAI_API_KEY = "test-key";
  process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT = "image-test";
  process.env.DAILY_BUDGET_USD = "0";
  delete process.env.AI_BASE_URL;
});

const images = vi.hoisted(() => ({ dir: "" }));
vi.mock("@/lib/paths", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/paths")>();
  const path = await import("node:path");
  return { ...real, imageDir: () => images.dir, imagePath: (id: string) => path.join(images.dir, `${id}.png`) };
});
vi.mock("@/lib/trainingroute", () => ({
  loadTraining: () => ({ notebookId: "nb", content: { sections: [{ cues: [] }], sourceIds: ["s1"] } }),
}));
vi.mock("@/lib/artifactsources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/artifactsources")>()),
  artifactSourceIds: () => ["s1"],
}));
vi.mock("@/lib/trainingplan", () => ({ trainingSourcePages: () => [] }));
vi.mock("@/lib/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http")>()),
  generationSourceError: () => null,
}));
// Keep-alive timing is covered elsewhere; here the route's own status codes matter.
vi.mock("@/lib/keepalive", () => ({ keepAliveJSON: (work: () => Promise<Response>) => work() }));

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { POST } from "@/app/api/training/[id]/assets/find/route";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
).toString("base64");

const dropped = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) });
const refused = () =>
  new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
const imageReply = () => new Response(JSON.stringify({ data: [{ b64_json: PNG }] }));
const truncatedReply = () =>
  new Response(
    new ReadableStream({
      start(c) {
        c.error(new TypeError("terminated", { cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }) }));
      },
    }),
  );

const call = () =>
  POST(
    new Request("http://localhost/api/training/v1/assets/find", {
      method: "POST",
      body: JSON.stringify({ prompt: "A watering can" }),
    }),
    { params: Promise.resolve({ id: "v1" }) },
  );

/** Run the route while the retry waits are skipped instantly. */
async function respond(script: (Response | Error)[]) {
  const queue = [...script];
  const fetchMock = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fetchMock);
  const pending = call();
  await vi.runAllTimersAsync();
  const res = await pending;
  return { res, body: (await res.json()) as { error?: string; code?: string; imageId?: string }, fetchMock };
}

beforeEach(() => {
  images.dir = fs.mkdtempSync(path.join(os.tmpdir(), "find-route-"));
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(images.dir, { recursive: true, force: true });
});

describe("POST /api/training/[id]/assets/find when the connection to Azure misbehaves", () => {
  it("retries a dropped connection and still returns the picture", async () => {
    const { res, body, fetchMock } = await respond([dropped(), imageReply()]);
    expect(res.status).toBe(200);
    expect(body.imageId).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 that says when to come back", async () => {
    const limited = new Response("slow down", { status: 429, headers: { "retry-after": "2" } });
    const { res, fetchMock } = await respond([limited, imageReply()]);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a connection that keeps dropping as transient, not as a wrong endpoint", async () => {
    const { res, body, fetchMock } = await respond([dropped(), dropped(), dropped()]);
    expect(res.status).toBe(503);
    expect(body.code).toBe("connection_dropped");
    expect(body.error).toContain("closed or timed out");
    expect(body.error).toContain("safe to retry");
    expect(body.error).not.toContain("AZURE_OPENAI_ENDPOINT");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("still reports an endpoint that refuses connections as a configuration problem", async () => {
    const { res, body } = await respond([refused(), refused()]);
    expect(res.status).toBe(502);
    expect(body.code).toBe("config");
    expect(body.error).toContain("Check AZURE_OPENAI_ENDPOINT is correct");
  });

  it("does not generate a second picture when the reply was cut off after Azure answered", async () => {
    const { res, body, fetchMock } = await respond([truncatedReply(), imageReply()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
    expect(body.error).toContain("may have been billed");
  });

  it("does not retry a rejected request", async () => {
    const { res, fetchMock } = await respond([new Response("forbidden", { status: 403 })]);
    expect(res.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
