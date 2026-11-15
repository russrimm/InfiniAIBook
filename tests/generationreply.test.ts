import { describe, expect, it } from "vitest";
import { generationReply, type GenerationStatus } from "@/lib/keepalive";
import { JSONReplyError, readJSONReply } from "@/lib/jsonreply";

const request = (stream = true) => new Request("http://localhost/api/generate", {
  headers: stream ? { accept: "application/x-ndjson" } : {},
});
const json = (body: unknown, status = 200) => Response.json(body, { status });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("generationReply", () => {
  it("preserves JSON and HTTP status for existing API clients", async () => {
    const res = await generationReply(request(false), async (report) => {
      report("Reading sources");
      return json({ error: "Select a source" }, 400);
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Select a source" });
  });

  it("delivers real stages before generation finishes", async () => {
    const pending = deferred<Response>();
    const seen = deferred<string>();
    const res = await generationReply(request(), async (report) => {
      report("Drawing the infographic");
      return pending.promise;
    });
    const statuses: string[] = [];
    const result = readJSONReply<{ id: string; error?: string }>(res, "Generation failed", (status) => {
      statuses.push(status);
      if (status === "Drawing the infographic") seen.resolve(status);
    });
    await seen.promise;
    expect(statuses).toEqual(["Preparing generation", "Drawing the infographic"]);
    pending.resolve(json({ id: "saved" }));
    await expect(result).resolves.toEqual({ id: "saved" });
  });

  it("keeps streamed errors and their original HTTP status", async () => {
    const res = await generationReply(request(), async () => json({ error: "Quota exceeded" }, 429));
    await expect(readJSONReply(res)).rejects.toMatchObject({
      name: "JSONReplyError", status: 429, message: "Quota exceeded",
    });
  });

  it("keeps saving after the browser disconnects", async () => {
    const pending = deferred<Response>();
    const saved = deferred<boolean>();
    let report!: GenerationStatus;
    const res = await generationReply(request(), async (update) => {
      report = update;
      const response = await pending.promise;
      saved.resolve(true);
      return response;
    });
    await res.body!.cancel();
    expect(() => report("Saving")).not.toThrow();
    pending.resolve(json({ id: "saved" }));
    await expect(saved.promise).resolves.toBe(true);
  });
});

describe("reading generation status streams", () => {
  const stream = (parts: string[]) => new Response(new ReadableStream({
    start(controller) {
      const bytes = new TextEncoder().encode(parts.join(""));
      // Splits JSON lines and multibyte UTF-8 characters across chunks.
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  }), { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });

  it("handles split chunks, heartbeats, Unicode and a final line without a newline", async () => {
    const statuses: string[] = [];
    const res = stream([
      '{"event":"status","status":"Writing café notes"}\n',
      '{"event":"heartbeat"}\n',
      '{"event":"result","status":201,"body":{"id":"note"}}',
    ]);
    await expect(readJSONReply<{ id: string; error?: string }>(res, "Failed", (s) => statuses.push(s)))
      .resolves.toEqual({ id: "note" });
    expect(statuses).toEqual(["Writing café notes"]);
  });

  it("explains a truncated stream instead of implying success", async () => {
    await expect(readJSONReply(stream(['{"event":"status","status":"Writing"}\n'])))
      .rejects.toThrow(/connection ended.*check the library/);
  });

  it("rejects malformed events and invalid results", async () => {
    for (const event of [
      { event: "status", status: 12 },
      { event: "result", status: 0, body: { id: "x" } },
      { event: "result", status: 200, body: null },
      { event: "unknown" },
    ]) {
      await expect(readJSONReply(stream([JSON.stringify(event)]))).rejects.toThrow(/Invalid generation/);
    }
  });

  it("preserves plain JSON compatibility when a status callback is supplied", async () => {
    const statuses: string[] = [];
    await expect(readJSONReply<{ id: string; error?: string }>(json({ id: "x" }), "Failed", (s) => statuses.push(s)))
      .resolves.toEqual({ id: "x" });
    expect(statuses).toEqual([]);
    await expect(readJSONReply(json({ error: "Failed" }, 502))).rejects.toBeInstanceOf(JSONReplyError);
  });
});
