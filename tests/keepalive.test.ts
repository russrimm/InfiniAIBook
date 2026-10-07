import { describe, expect, it } from "vitest";
import { keepAliveJSON } from "@/lib/keepalive";
import { readJSONReply } from "@/lib/jsonreply";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("keepAliveJSON", () => {
  it("returns quick work unchanged, status included", async () => {
    const res = await keepAliveJSON(async () => json({ error: "Select at least one source." }, 400));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Select at least one source." });
  });

  it("streams whitespace while slow work runs, then the body", async () => {
    const res = await keepAliveJSON(
      async () => {
        await wait(80);
        return json({ id: "abc" });
      },
      { graceMs: 10, intervalMs: 20 }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(JSON.stringify({ id: "abc" }).length + 1);
    expect(text.trimStart().startsWith("{")).toBe(true);
    expect(JSON.parse(text)).toEqual({ id: "abc" });
  });

  it("carries a late failure as { error } once the 200 is sent", async () => {
    const res = await keepAliveJSON(
      async () => {
        await wait(30);
        return json({ error: "Model failed" }, 502);
      },
      { graceMs: 5 }
    );
    expect(res.status).toBe(200);
    await expect(readJSONReply(res)).rejects.toThrow("Model failed");
  });

  it("turns a late thrown error into { error }", async () => {
    const res = await keepAliveJSON(
      async () => {
        await wait(30);
        throw new Error("boom");
      },
      { graceMs: 5 }
    );
    expect(JSON.parse(await res.text())).toMatchObject({ error: "boom" });
  });
});

describe("readJSONReply", () => {
  it("explains a proxy's plain-text timeout instead of a JSON parse error", async () => {
    const res = new Response("stream timeout", { status: 408 });
    await expect(readJSONReply(res)).rejects.toThrow(/took too long/);
  });

  it("reports other non-JSON replies with their status", async () => {
    const res = new Response("Bad Gateway", { status: 502 });
    await expect(readJSONReply(res, "Generation failed")).rejects.toThrow(
      "Generation failed (502: Bad Gateway)"
    );
  });

  it("returns the parsed body on success", async () => {
    await expect(readJSONReply(json({ id: "x" }))).resolves.toEqual({ id: "x" });
  });
});
