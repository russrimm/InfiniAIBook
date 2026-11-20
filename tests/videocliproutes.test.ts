import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as statusGET, POST as startPOST } from "@/app/api/videoclip/route";
import { POST as draftPOST } from "@/app/api/videoclip/prompts/route";
import { POST as cancelPOST } from "@/app/api/videoclip/[id]/cancel/route";
import { GET as clipGET } from "@/app/api/videoclip/[id]/[clip]/route";
import { GET as posterGET } from "@/app/api/videoclip/[id]/[clip]/poster/route";
import { DELETE as artifactDELETE, GET as artifactGET, PATCH as artifactPATCH } from "@/app/api/artifacts/[id]/route";
import { db } from "@/lib/db";
import { budgetStatus } from "@/lib/budget";
import { clipPath } from "@/lib/paths";
import type { ClipContent } from "@/lib/types";
import type { ClipCapabilities, ClipRequest, RemoteJob, VideoProvider } from "@/lib/videoclip";
import { reconcileStalledClip } from "@/lib/videoclipstore";
import { MP4 } from "./videofixtures";
import { idCtx, request, resetNotebooks, seedArtifact, seedNotebook, seedSource } from "./routehelpers";

const mocks = vi.hoisted(() => ({ provider: null as unknown, chatJSON: vi.fn(), embed: vi.fn() }));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  chatJSON: mocks.chatJSON,
  embed: mocks.embed,
}));

vi.mock("@/lib/videoproviders", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/videoproviders")>();
  return {
    ...real,
    currentVideoProvider: () => mocks.provider as VideoProvider | null,
    videoStatus: () =>
      mocks.provider
        ? { configured: true, capabilities: (mocks.provider as VideoProvider).capabilities() }
        : { configured: false, reason: "No video model is configured." },
  };
});

const caps: ClipCapabilities = {
  kind: "openai",
  label: "Test video",
  model: "vid-1",
  aspects: ["16:9", "9:16"],
  durations: [4, 8],
  resolutions: [{ id: "720p", label: "720p" }],
  defaultResolution: "720p",
  maxVariants: 2,
  maxClips: 4,
  referenceImage: true,
  prices: { "720p": 0.1 },
  priceNote: "test price",
};

type Behavior = (prompt: string, call: { signal?: AbortSignal }) => Promise<RemoteJob>;
function fakeProvider(behavior: Behavior = async () => ({ id: "remote-" + Math.random().toString(36).slice(2, 8), status: "completed", inline: MP4 })) {
  const removed: string[] = [];
  const calls: { prompt: string; req: ClipRequest }[] = [];
  const provider: VideoProvider = {
    kind: "openai",
    capabilities: () => caps,
    start: async (req, prompt, call = {}) => {
      calls.push({ prompt, req });
      return behavior(prompt, call);
    },
    poll: async (id) => ({ id, status: "completed", inline: MP4 }),
    download: async (job, dest) => {
      fs.mkdirSync(dest.replace(/[^\\/]+$/, ""), { recursive: true });
      fs.writeFileSync(dest, job.inline ?? MP4);
      return MP4.length;
    },
    remove: async (id) => {
      removed.push(id);
    },
  };
  return { provider, removed, calls };
}

const stageOf = (id: string) => {
  const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(id) as unknown as { content: string } | undefined;
  return row ? (JSON.parse(row.content) as ClipContent) : undefined;
};
async function settled(id: string) {
  for (let i = 0; i < 200; i++) {
    const c = stageOf(id);
    if (c && c.progress.stage !== "generating") return c;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("the run did not settle");
}

let notebookId: string;
let sourceId: string;
beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.provider = null;
  delete process.env.DAILY_BUDGET_USD;
  notebookId = seedNotebook();
  sourceId = seedSource(notebookId, { title: "Doc", chunks: ["Solar panels turn sunlight into power.", "Wind turbines spin."] });
  mocks.embed.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0]));
});

const start = (body: Record<string, unknown> = {}) =>
  startPOST(request("/api/videoclip", "POST", { notebookId, sourceIds: [sourceId], prompts: ["a solar farm at dawn"], duration: 4, ...body }));

describe("GET /api/videoclip", () => {
  it("says plainly that no video model is configured", async () => {
    const body = await (await statusGET()).json();
    expect(body).toMatchObject({ configured: false, reason: "No video model is configured." });
  });

  it("returns the capabilities and today's budget when configured", async () => {
    mocks.provider = fakeProvider().provider;
    const body = await (await statusGET()).json();
    expect(body.configured).toBe(true);
    expect(body.capabilities.durations).toEqual([4, 8]);
    expect(body.budget).toHaveProperty("enabled");
  });
});

describe("POST /api/videoclip", () => {
  it("refuses with a setup message when no video model is configured", async () => {
    const res = await start();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("not_configured");
    expect(body.error).toMatch(/No video model is configured/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM artifacts WHERE type = 'clip'").get()).toMatchObject({ n: 0 });
  });

  it("validates sources and options before spending anything", async () => {
    const f = fakeProvider();
    mocks.provider = f.provider;
    expect((await start({ sourceIds: [] })).status).toBe(400);
    const badDuration = await start({ duration: 7 });
    expect(badDuration.status).toBe(400);
    expect((await badDuration.json()).error).toMatch(/accepts clips of 4, 8 seconds/);
    expect((await start({ prompts: [] })).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });

  it("makes the clips, stores them as a library artifact with citations, and charges the budget per clip", async () => {
    process.env.DAILY_BUDGET_USD = "10";
    const f = fakeProvider();
    mocks.provider = f.provider;
    const before = budgetStatus().spentCents;

    const res = await start({ prompts: ["a solar farm at dawn", "wind turbines at dusk"], variants: 2, duration: 8 });
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created).toMatchObject({ type: "clip", title: "2 video clips" });
    expect(created.content.progress).toMatchObject({ stage: "generating", total: 4 });
    expect(created.content.estimate.usd).toBeCloseTo(3.2);

    const done = await settled(created.id);
    expect(done.progress).toEqual({ stage: "done", done: 4, failed: 0, total: 4 });
    expect(done.clips.map((c) => c.videoUrl)).toEqual([0, 1, 2, 3].map((n) => `/api/videoclip/${created.id}/${n}`));
    for (let n = 0; n < 4; n++) expect(fs.existsSync(clipPath(created.id, n))).toBe(true);
    expect(done.clips.map((c) => c.prompt)).toEqual(["a solar farm at dawn", "a solar farm at dawn", "wind turbines at dusk", "wind turbines at dusk"]);
    expect(budgetStatus().spentCents - before).toBe(4 * 80);

    const stored = JSON.parse((db.prepare("SELECT content FROM artifacts WHERE id = ?").get(created.id) as unknown as { content: string }).content);
    expect(stored.sourceIds).toEqual([sourceId]);
    expect(stored.citations.length).toBeGreaterThan(0);
    // Nothing secret or user-typed ends up anywhere but the artifact's own prompts.
    expect(JSON.stringify(stored)).not.toMatch(/Bearer|api-key/i);
  });

  it("refuses a run that cannot fit under today's budget and starts nothing", async () => {
    process.env.DAILY_BUDGET_USD = "1";
    const f = fakeProvider();
    mocks.provider = f.provider;
    const res = await start({ duration: 8, variants: 2 });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("budget");
    expect(body.error).toMatch(/would cost about \$1\.60/);
    expect(f.calls).toHaveLength(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM artifacts WHERE type = 'clip'").get()).toMatchObject({ n: 0 });
  });

  it("keeps the clips that worked when one prompt is refused, and says why", async () => {
    const f = fakeProvider(async (prompt) => {
      if (/people/.test(prompt)) {
        return { id: "bad", status: "failed", error: { code: "moderation_blocked", message: "Real people cannot be generated.", moderation: true } };
      }
      return { id: "good", status: "completed", inline: MP4 };
    });
    mocks.provider = f.provider;
    const created = await (await start({ prompts: ["a solar farm", "famous people waving"] })).json();
    const done = await settled(created.id);

    expect(done.progress).toMatchObject({ stage: "partial", done: 1, failed: 1, total: 2 });
    expect(done.clips[0]).toMatchObject({ status: "completed" });
    expect(done.clips[1]).toMatchObject({ status: "failed", moderation: true });
    expect(done.clips[1].error).toMatch(/declined this prompt on content grounds: Real people cannot be generated/);
    expect(fs.existsSync(clipPath(created.id, 1))).toBe(false);
    expect(f.removed).toContain("bad");
  });

  it("cancels: running clips stop and are deleted remotely, queued ones never start or cost anything", async () => {
    process.env.DAILY_BUDGET_USD = "10";
    process.env.VIDEO_CLIP_CONCURRENCY = "1";
    const hang: Behavior = (_p, call) =>
      new Promise((_resolve, reject) => {
        call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
      });
    const f = fakeProvider(hang);
    mocks.provider = f.provider;
    const before = budgetStatus().spentCents;
    const created = await (await start({ prompts: ["one", "two", "three"] })).json();

    await vi.waitFor(() => expect(f.calls).toHaveLength(1));
    const res = await cancelPOST(request(`/api/videoclip/${created.id}/cancel`, "POST"), idCtx(created.id));
    expect(await res.json()).toEqual({ cancelled: true });

    const done = await settled(created.id);
    expect(done.progress.stage).toBe("cancelled");
    expect(done.clips.map((c) => c.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
    expect(f.calls).toHaveLength(1);
    expect(budgetStatus().spentCents - before).toBe(40);
    delete process.env.VIDEO_CLIP_CONCURRENCY;
    expect((await (await cancelPOST(request("/x", "POST"), idCtx(created.id))).json()).cancelled).toBe(false);
  });
});

describe("clip media and artifact routes", () => {
  async function made() {
    mocks.provider = fakeProvider().provider;
    const created = await (await start()).json();
    await settled(created.id);
    return created.id as string;
  }
  const ctx = (id: string, clip: string) => ({ params: Promise.resolve({ id, clip }) });

  it("serves the MP4 with byte ranges and refuses ids that are not clips", async () => {
    const id = await made();
    const full = await clipGET(request(`/api/videoclip/${id}/0`), ctx(id, "0"));
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(Buffer.from(await full.arrayBuffer()).equals(MP4)).toBe(true);

    const part = await clipGET(request(`/api/videoclip/${id}/0`, "GET", undefined, { range: "bytes=4-11" }), ctx(id, "0"));
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 4-11/${MP4.length}`);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("ftypmp42");

    expect((await clipGET(request("/x"), ctx(id, "7"))).status).toBe(404);
    expect((await clipGET(request("/x"), ctx("../etc", "0"))).status).toBe(404);
    expect((await clipGET(request("/x"), ctx(id, "-1"))).status).toBe(404);
    expect((await posterGET(request("/x"), ctx(id, "0"))).status).toBe(404);
  });

  it("renames, and deletes the files and the remote jobs", async () => {
    const f = fakeProvider();
    mocks.provider = f.provider;
    const created = await (await start()).json();
    const done = await settled(created.id);
    const remote = done.clips[0].remoteId!;

    const renamed = await artifactPATCH(request(`/api/artifacts/${created.id}`, "PATCH", { title: "  Dawn   B-roll " }), idCtx(created.id));
    expect(await renamed.json()).toEqual({ id: created.id, title: "Dawn B-roll" });
    const reread = await (await artifactGET(request("/x"), idCtx(created.id))).json();
    expect(reread.title).toBe("Dawn B-roll");
    expect(reread.content.title).toBe("Dawn B-roll");
    expect((await artifactPATCH(request("/x", "PATCH", { title: " " }), idCtx(created.id))).status).toBe(400);
    expect((await artifactPATCH(request("/x", "PATCH", { title: "t" }), idCtx("nope"))).status).toBe(404);

    expect(fs.existsSync(clipPath(created.id, 0))).toBe(true);
    await artifactDELETE(request("/x", "DELETE"), idCtx(created.id));
    expect(fs.existsSync(clipPath(created.id, 0))).toBe(false);
    expect(stageOf(created.id)).toBeUndefined();
    await vi.waitFor(() => expect(f.removed).toContain(remote));
  });

  it("marks a run that died with the process as failed instead of spinning forever", async () => {
    const stalled: ClipContent = {
      title: "Lost",
      provider: { kind: "openai", label: "Test", model: "m" },
      options: { aspect: "16:9", duration: 4, resolution: "720p", variants: 1 },
      clips: [
        { index: 0, prompt: "p", variant: 1, status: "completed", videoUrl: "/api/videoclip/x/0" },
        { index: 1, prompt: "q", variant: 1, status: "in_progress" },
      ],
      progress: { stage: "generating", done: 1, failed: 0, total: 2 },
      estimate: { usd: 1, seconds: 8, priceNote: "" },
    };
    const id = seedArtifact(notebookId, "clip", stalled, "Lost");
    reconcileStalledClip(id);
    const healed = stageOf(id)!;
    expect(healed.progress).toMatchObject({ stage: "partial", done: 1, failed: 1 });
    expect(healed.clips[1].error).toMatch(/restarted while this clip was being made/);
  });
});

describe("POST /api/videoclip/prompts", () => {
  const draft = (body: Record<string, unknown> = {}) =>
    draftPOST(request("/api/videoclip/prompts", "POST", { notebookId, sourceIds: [sourceId], aspect: "9:16", duration: 8, ...body }));

  it("drafts prompts from the selected sources only", async () => {
    mocks.provider = fakeProvider().provider;
    mocks.chatJSON.mockResolvedValue({ prompts: [{ title: "Sunrise farm", prompt: "A slow dolly shot across a quiet solar farm at sunrise with warm light on the panels." }] });
    const res = await draft({ count: 1 });
    expect(res.status).toBe(200);
    expect((await res.json()).prompts).toEqual([
      { title: "Sunrise farm", prompt: "A slow dolly shot across a quiet solar farm at sunrise with warm light on the panels." },
    ]);
    const messages = mocks.chatJSON.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages[0].content).toMatch(/Portrait 9:16/);
    expect(messages[0].content).toMatch(/No real people/);
    expect(messages[1].content).toMatch(/Solar panels turn sunlight into power/);
  });

  it("requires explicit sources and reports an unusable draft", async () => {
    expect((await draft({ sourceIds: [] })).status).toBe(400);
    mocks.chatJSON.mockResolvedValue({ prompts: [] });
    const res = await draft();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/usable clip prompts/);
  });
});
