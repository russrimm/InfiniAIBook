import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cueClipGET } from "@/app/api/training/[id]/cueclips/[clipId]/route";
import { GET as stateGET, POST as startPOST } from "@/app/api/training/[id]/assets/clip/route";
import { POST as visualsPOST } from "@/app/api/training/[id]/visuals/route";
import { budgetStatus } from "@/lib/budget";
import { db } from "@/lib/db";
import { removeVideo, trainingCueClipPath, trainingCueClipsDir } from "@/lib/paths";
import type { ClipCapabilities, RemoteJob, VideoProvider } from "@/lib/videoclip";
import { MP4 } from "./videofixtures";
import { idCtx, request, resetNotebooks, seedArtifact, seedNotebook } from "./routehelpers";

const mocks = vi.hoisted(() => ({ provider: null as unknown, plan: vi.fn() }));

vi.mock("@/lib/videoproviders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/videoproviders")>()),
  currentVideoProvider: () => mocks.provider as VideoProvider | null,
  videoStatus: () => ({ configured: Boolean(mocks.provider) }),
}));
vi.mock("@/lib/trainingplan", () => ({ planTrainingVisuals: mocks.plan }));

const caps: ClipCapabilities = {
  kind: "openai",
  label: "Test video",
  model: "vid-1",
  aspects: ["16:9", "9:16"],
  durations: [4, 8],
  resolutions: [{ id: "720p", label: "720p" }],
  defaultResolution: "720p",
  maxVariants: 1,
  maxClips: 3,
  referenceImage: false,
  prices: { "720p": 0.1 },
  priceNote: "test",
};

function fakeProvider(start: (call: { signal?: AbortSignal }) => Promise<RemoteJob> = async () => ({ id: "r1", status: "completed", inline: MP4 })) {
  const removed: string[] = [];
  const asked: unknown[] = [];
  const provider: VideoProvider = {
    kind: "openai",
    capabilities: () => caps,
    start: async (req, prompt, call = {}) => {
      asked.push({ req, prompt });
      return start(call);
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
  return { provider, removed, asked };
}

let trainingId: string;
beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.DAILY_BUDGET_USD;
  mocks.provider = null;
  const notebook = seedNotebook();
  trainingId = seedArtifact(
    notebook,
    "training",
    { title: "T", sections: [{ title: "S", text: "Words." }], progress: { stage: "script" }, sourceIds: [] },
    "T",
  );
});

const CUE = "cue12345";
const start = (body: Record<string, unknown> = {}, id = trainingId) =>
  startPOST(request(`/api/training/${id}/assets/clip`, "POST", { cueId: CUE, prompt: "A calm harbor at dusk.", seconds: 4, ...body }), idCtx(id));
const state = async () => (await (await stateGET(request(`/api/training/${trainingId}/assets/clip?cueId=${CUE}`), idCtx(trainingId))).json()).state;
const settled = async () => {
  await vi.waitFor(async () => expect(["completed", "failed", "cancelled"]).toContain((await state())?.status));
  return state();
};

describe("making a clip for a training visual", () => {
  it("refuses when no video model is configured, and for a video or cue that does not exist", async () => {
    const res = await start();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
    mocks.provider = fakeProvider().provider;
    expect((await start({}, "nope")).status).toBe(404);
    expect((await start({ cueId: "../x" })).status).toBe(400);
  });

  it("validates the request before spending anything", async () => {
    const f = fakeProvider();
    mocks.provider = f.provider;
    const res = await start({ seconds: 7 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/accepts clips of 4, 8 seconds/);
    expect((await start({ prompt: " " })).status).toBe(400);
    expect(f.asked).toHaveLength(0);
  });

  it("starts at once, saves the clip under the video, charges the budget and deletes the remote copy", async () => {
    process.env.DAILY_BUDGET_USD = "10";
    const f = fakeProvider();
    mocks.provider = f.provider;
    const before = budgetStatus().spentCents;
    const res = await start({ seconds: 8 });
    expect(res.status).toBe(200);
    const started = (await res.json()).state;
    expect(started.estimate.totalUsd).toBeCloseTo(0.8);

    const done = await settled();
    expect(done).toMatchObject({ status: "completed", seconds: 8 });
    expect(done.clipId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(fs.existsSync(trainingCueClipPath(trainingId, done.clipId))).toBe(true);
    expect(budgetStatus().spentCents - before).toBe(80);
    await vi.waitFor(() => expect(f.removed).toEqual(["r1"]));
    expect(f.asked).toHaveLength(1);
  });

  it("refuses a clip that cannot fit today's budget and starts nothing", async () => {
    process.env.DAILY_BUDGET_USD = "0.2";
    const f = fakeProvider();
    mocks.provider = f.provider;
    const res = await start({ seconds: 8 });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "budget" });
    expect(f.asked).toHaveLength(0);
  });

  it("shows the provider's refusal with its message, and does not make a clip", async () => {
    mocks.provider = fakeProvider(async () => ({
      id: "bad",
      status: "failed",
      error: { code: "moderation_blocked", message: "Real people cannot be generated.", moderation: true },
    })).provider;
    await start({ prompt: "A famous person waving." });
    const done = await settled();
    expect(done).toMatchObject({ status: "failed", moderation: true });
    expect(done.error).toMatch(/Real people cannot be generated/);
    expect(done.clipId).toBeUndefined();
  });

  it("cancels a clip in progress, and will not start two for one visual", async () => {
    const f = fakeProvider(
      (call) =>
        new Promise((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
        }),
    );
    mocks.provider = f.provider;
    await start();
    await vi.waitFor(() => expect(f.asked).toHaveLength(1));
    const again = await start();
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "busy" });

    const cancel = await start({ cancel: true });
    expect(await cancel.json()).toEqual({ cancelled: true });
    expect((await settled()).status).toBe("cancelled");
  });

  it("will not start while the video is rendering", async () => {
    mocks.provider = fakeProvider().provider;
    const rendering = seedArtifact(seedNotebook(), "training", { title: "T", sections: [], progress: { stage: "composing" } }, "T");
    const res = await start({}, rendering);
    expect(res.status).toBe(409);
  });
});

describe("serving and removing training clips", () => {
  it("serves a clip with byte ranges and refuses anything that is not a clip id", async () => {
    fs.mkdirSync(trainingCueClipsDir(trainingId), { recursive: true });
    fs.writeFileSync(trainingCueClipPath(trainingId, "clip12345678"), MP4);
    const ctx = (clipId: string) => ({ params: Promise.resolve({ id: trainingId, clipId }) });
    const full = await cueClipGET(request("/x"), ctx("clip12345678"));
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    const part = await cueClipGET(request("/x", "GET", undefined, { range: "bytes=4-11" }), ctx("clip12345678"));
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("ftypmp42");
    expect((await cueClipGET(request("/x"), ctx("../secret"))).status).toBe(404);
    expect((await cueClipGET(request("/x"), ctx("missing12345"))).status).toBe(404);

    removeVideo(trainingId);
    expect(fs.existsSync(trainingCueClipsDir(trainingId))).toBe(false);
  });
});

describe("planning visuals", () => {
  const plan = (body: Record<string, unknown>) => visualsPOST(request(`/api/training/${trainingId}/visuals`, "POST", body), idCtx(trainingId));

  it("proposes clips only when the request says so", async () => {
    mocks.plan.mockResolvedValue([[]]);
    await plan({});
    expect(mocks.plan.mock.calls[0][3]).toMatchObject({ clips: false });
    await plan({ clips: true });
    expect(mocks.plan.mock.calls[1][3]).toMatchObject({ clips: true });
    await plan({ clips: "yes" });
    expect(mocks.plan.mock.calls[2][3]).toMatchObject({ clips: false });
    expect(db.prepare("SELECT COUNT(*) AS n FROM artifacts WHERE id = ?").get(trainingId)).toMatchObject({ n: 1 });
  });
});
