import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as stateGET, PUT as settingsPUT } from "@/app/api/bookends/[id]/route";
import { GET as jobGET, POST as clipPOST } from "@/app/api/bookends/[id]/clip/route";
import { POST as filePOST } from "@/app/api/bookends/[id]/file/route";
import { GET as mediaGET } from "@/app/api/bookends/[id]/media/[clipId]/route";
import { POST as renderPOST } from "@/app/api/video/[id]/render/route";
import { applyBookends } from "@/lib/bookendbuild";
import { bookendClipPath, bookendDir, clipDir, clipPath, removeVideo } from "@/lib/paths";
import { budgetStatus } from "@/lib/budget";
import { db } from "@/lib/db";
import { startTrainingRender } from "@/lib/trainingbuild";
import type { ClipCapabilities, RemoteJob, VideoProvider } from "@/lib/videoclip";
import { MP4 } from "./videofixtures";
import { idCtx, request, resetNotebooks, seedArtifact, seedNotebook } from "./routehelpers";

const mocks = vi.hoisted(() => ({ provider: null as unknown }));
/** A real two-second MP4, so its length can be read from its header. */
const REAL_CLIP = path.join(process.cwd(), "e2e", "fixtures", "clip.mp4");

vi.mock("@/lib/videoproviders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/videoproviders")>()),
  currentVideoProvider: () => mocks.provider as VideoProvider | null,
  videoStatus: () =>
    mocks.provider
      ? { configured: true, capabilities: (mocks.provider as VideoProvider).capabilities() }
      : { configured: false, reason: "No video model is configured." },
}));

const caps: ClipCapabilities = {
  kind: "gemini",
  label: "Test video",
  model: "vid-1",
  aspects: ["16:9", "9:16"],
  durations: [3, 6],
  resolutions: [{ id: "720p", label: "720p" }],
  defaultResolution: "720p",
  maxVariants: 1,
  maxClips: 3,
  referenceImage: false,
  prices: { "720p": 0.1 },
  priceNote: "test",
};

function fakeProvider(start: (call: { signal?: AbortSignal }) => Promise<RemoteJob> = async () => ({ id: "r1", status: "completed", inline: MP4 })) {
  const asked: unknown[] = [];
  const provider: VideoProvider = {
    kind: "gemini",
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
    remove: async () => {},
  };
  return { provider, asked };
}

let id: string;
beforeEach(() => {
  resetNotebooks();
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.DAILY_BUDGET_USD;
  mocks.provider = null;
  id = seedArtifact(
    seedNotebook(),
    "training",
    { title: "T", sections: [{ title: "S", text: "Words." }], progress: { stage: "script" }, sourceIds: [] },
    "T",
  );
});

const url = (path = "") => `/api/bookends/${id}${path}`;
const get = async () => (await stateGET(request(url()), idCtx(id))).json();
const put = (body: unknown) => settingsPUT(request(url(), "PUT", body), idCtx(id));
const generate = (slot = "intro", extra: Record<string, unknown> = {}) =>
  clipPOST(request(url("/clip"), "POST", { slot, prompt: "A calm harbor at dusk.", seconds: 6, ...extra }), idCtx(id));
const job = async (slot = "intro") => (await (await jobGET(request(url(`/clip?slot=${slot}`)), idCtx(id))).json()).state;
const settled = async (slot = "intro") => {
  await vi.waitFor(async () => expect(["completed", "failed", "cancelled"]).toContain((await job(slot))?.status));
  return job(slot);
};

describe("the settings", () => {
  it("start off, with nothing to render without and nothing to pay", async () => {
    mocks.provider = fakeProvider().provider;
    const s = await get();
    expect(s.bookends).toMatchObject({ intro: { mode: "off" }, outro: { mode: "off" }, fade: "short" });
    expect(s.problems).toEqual([]);
    expect(s.estimate.totalUsd).toBe(0);
    expect(s.rendering).toBe(false);
  });

  it("are saved, with the combined estimate for what is still to be made", async () => {
    mocks.provider = fakeProvider().provider;
    const res = await put({ intro: { mode: "ai", prompt: "Open on a harbor.", seconds: 6 }, outro: { mode: "ai", prompt: "Close on a harbor.", seconds: 3 }, fade: "long" });
    expect(res.status).toBe(200);
    const s = await get();
    expect(s.bookends).toMatchObject({ intro: { mode: "ai", seconds: 6 }, fade: "long" });
    expect(s.estimate.totalUsd).toBeCloseTo(0.9);
    expect(s.problems).toHaveLength(2);
  });

  it("do not work without a video model for generating, but still load", async () => {
    const s = await get();
    expect(s.video.configured).toBe(false);
    expect(s.estimate).toBeNull();
    const res = await generate();
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "not_configured" });
  });

  it("refuse a video that does not exist, and changes while rendering", async () => {
    expect((await settingsPUT(request("/x", "PUT", {}), idCtx("nope"))).status).toBe(404);
    const rendering = seedArtifact(seedNotebook(), "training", { title: "T", sections: [], progress: { stage: "composing" } }, "T");
    const res = await settingsPUT(request("/x", "PUT", { intro: { mode: "upload" } }), idCtx(rendering));
    expect(res.status).toBe(409);
  });
});

describe("making a clip for a slot", () => {
  it("saves it under the video and records it on the slot, keyed so a re-render reuses it", async () => {
    process.env.DAILY_BUDGET_USD = "10";
    const f = fakeProvider();
    mocks.provider = f.provider;
    const before = budgetStatus().spentCents;
    const res = await generate("intro", { seconds: 6 });
    expect(res.status).toBe(200);
    expect((await res.json()).state.estimate.totalUsd).toBeCloseTo(0.6);

    const done = await settled();
    expect(done).toMatchObject({ status: "completed", seconds: 6 });
    expect(fs.existsSync(bookendClipPath(id, done.clipId))).toBe(true);
    expect(budgetStatus().spentCents - before).toBe(60);

    const s = await get();
    expect(s.bookends.intro).toMatchObject({ mode: "ai", clipId: done.clipId, clipSeconds: 6, label: "Generated with AI" });
    expect(s.slots.intro.status).toBe("ready");
    expect(s.problems).toEqual([]);
    expect(s.estimate.totalUsd).toBe(0);
    expect(f.asked).toHaveLength(1);
  });

  it("keeps the clip when the settings are saved again, and lets it go only when asked", async () => {
    mocks.provider = fakeProvider().provider;
    await generate();
    const { clipId } = await settled();
    await put({ intro: { mode: "ai", prompt: "A calm harbor at dusk.", seconds: 6 }, outro: { mode: "off" }, fade: "cut" });
    expect((await get()).bookends.intro.clipId).toBe(clipId);
    await put({ intro: { mode: "ai", prompt: "A calm harbor at dusk.", seconds: 6 }, clear: ["intro"] });
    expect((await get()).bookends.intro.clipId).toBeUndefined();
  });

  it("marks the clip out of date when its prompt changes, and prices a regenerate", async () => {
    mocks.provider = fakeProvider().provider;
    await generate();
    await settled();
    await put({ intro: { mode: "ai", prompt: "A different shot entirely.", seconds: 6 } });
    const s = await get();
    expect(s.slots.intro.status).toBe("stale");
    expect(s.estimate.items).toHaveLength(1);
  });

  it("validates the request and the budget before spending anything", async () => {
    const f = fakeProvider();
    mocks.provider = f.provider;
    expect((await generate("middle")).status).toBe(400);
    expect((await generate("intro", { prompt: " " })).status).toBe(400);
    process.env.DAILY_BUDGET_USD = "0.2";
    const res = await generate("intro", { seconds: 6 });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "budget" });
    expect(f.asked).toHaveLength(0);
  });

  it("reports the provider's refusal for that slot only, and leaves no clip", async () => {
    mocks.provider = fakeProvider(async () => ({
      id: "bad",
      status: "failed",
      error: { code: "moderation_blocked", message: "Real people cannot be generated.", moderation: true },
    })).provider;
    await generate("outro");
    const done = await settled("outro");
    expect(done).toMatchObject({ status: "failed", moderation: true });
    expect(done.error).toMatch(/Real people cannot be generated/);
    const s = await get();
    expect(s.bookends.outro.clipId).toBeUndefined();
    expect(s.slots.intro.job).toBeNull();
  });

  it("cancels one in progress and will not start two for one slot", async () => {
    const f = fakeProvider(
      (call) =>
        new Promise((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
        }),
    );
    mocks.provider = f.provider;
    await generate();
    await vi.waitFor(() => expect(f.asked).toHaveLength(1));
    expect((await generate()).status).toBe(409);
    const cancel = await clipPOST(request(url("/clip"), "POST", { slot: "intro", cancel: true }), idCtx(id));
    expect(await cancel.json()).toEqual({ cancelled: true });
    expect((await settled()).status).toBe("cancelled");
  });
});

describe("using an existing video", () => {
  const upload = (bytes: Uint8Array, slot = "intro") => {
    const form = new FormData();
    form.set("slot", slot);
    form.set("file", new File([bytes as BlobPart], "intro.mp4", { type: "video/mp4" }));
    return filePOST(new Request(`http://localhost${url("/file")}`, { method: "POST", body: form }), idCtx(id));
  };

  it("refuses something that is not an MP4, and keeps nothing", async () => {
    const res = await upload(new TextEncoder().encode("not a video at all"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not an MP4/);
    expect(fs.existsSync(bookendDir(id))).toBe(false);
  });

  it("keeps an uploaded MP4 with its measured length, and records it on the slot", async () => {
    const res = await upload(fs.readFileSync(REAL_CLIP));
    expect(res.status).toBe(200);
    const slot = (await res.json()).bookends.intro;
    expect(slot).toMatchObject({ mode: "upload", label: "intro.mp4" });
    expect(slot.clipSeconds).toBeCloseTo(2, 0);
    expect(fs.existsSync(bookendClipPath(id, slot.clipId))).toBe(true);
    expect((await get()).problems).toEqual([]);
  });

  it("copies a library clip from the same notebook, so deleting the original is safe", async () => {
    const notebook = (db.prepare("SELECT notebook_id FROM artifacts WHERE id = ?").get(id) as unknown as { notebook_id: string }).notebook_id;
    const clip = seedArtifact(notebook, "clip", { title: "Harbor", clips: [] }, "Harbor");
    fs.mkdirSync(clipDir(), { recursive: true });
    fs.copyFileSync(REAL_CLIP, clipPath(clip, 0));
    const res = await filePOST(request(url("/file"), "POST", { slot: "outro", artifactId: clip, index: 0 }), idCtx(id));
    expect(res.status).toBe(200);
    const slot = (await res.json()).bookends.outro;
    expect(slot).toMatchObject({ mode: "library", label: "Harbor" });
    fs.rmSync(clipPath(clip, 0));
    expect(fs.existsSync(bookendClipPath(id, slot.clipId))).toBe(true);
  });

  it("refuses a library clip from another notebook or one that is not a clip", async () => {
    const other = seedArtifact(seedNotebook(), "clip", { title: "C", clips: [] }, "C");
    const res = await filePOST(request(url("/file"), "POST", { slot: "intro", artifactId: other, index: 0 }), idCtx(id));
    expect(res.status).toBe(404);
    expect((await filePOST(request(url("/file"), "POST", { slot: "intro", artifactId: id, index: 0 }), idCtx(id))).status).toBe(404);
    expect((await filePOST(request(url("/file"), "POST", { slot: "x" }), idCtx(id))).status).toBe(400);
  });
});

describe("serving a clip", () => {
  it("supports byte ranges and refuses anything that is not a clip id", async () => {
    fs.mkdirSync(bookendDir(id), { recursive: true });
    fs.writeFileSync(bookendClipPath(id, "clip12345678"), MP4);
    const ctx = (clipId: string) => ({ params: Promise.resolve({ id, clipId }) });
    expect((await mediaGET(request("/x"), ctx("clip12345678"))).status).toBe(200);
    const part = await mediaGET(request("/x", "GET", undefined, { range: "bytes=4-11" }), ctx("clip12345678"));
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer()).toString()).toBe("ftypmp42");
    expect((await mediaGET(request("/x"), ctx("../secret"))).status).toBe(404);
    removeVideo(id);
    expect(fs.existsSync(bookendDir(id))).toBe(false);
  });
});

describe("a render never silently drops a requested intro or outro", () => {
  it("is refused for a training video whose intro has no clip, and allowed once it is off", async () => {
    await put({ intro: { mode: "ai", prompt: "x" } });
    await expect(startTrainingRender(id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/intro clip is turned on but has no clip/) });
    await put({ intro: { mode: "off" } });
    await expect(startTrainingRender(id)).rejects.not.toMatchObject({ message: expect.stringMatching(/intro/) });
  });

  it("is refused for a motion explainer too", async () => {
    const motion = seedArtifact(
      seedNotebook(),
      "motion",
      { title: "M", plan: { title: "M", scenes: [{}, {}, {}] }, progress: { stage: "done" }, bookends: { outro: { mode: "upload" } } },
      "M",
    );
    const res = await renderPOST(request(`/api/video/${motion}/render`, "POST"), idCtx(motion));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/outro clip is turned on but has no clip/);
    const row = db.prepare("SELECT content FROM artifacts WHERE id = ?").get(motion) as unknown as { content: string };
    expect(JSON.parse(row.content).progress.stage).toBe("done");
  });
});

describe("putting them around the video", () => {
  it("keeps the video and says so when a requested clip is missing, rather than pretending", async () => {
    fs.mkdirSync(bookendDir(id), { recursive: true });
    const main = bookendClipPath(id, "main12345678");
    fs.writeFileSync(main, MP4);
    const result = await applyBookends(id, main, { intro: { mode: "library", clipId: "gone12345678" }, outro: { mode: "off" }, fade: "short" }, bookendDir(id));
    expect(result.applied).toEqual([]);
    expect(result.note).toMatch(/intro could not be added.*saved without it/);
    expect(fs.readFileSync(main).equals(Buffer.from(MP4))).toBe(true);
  });

  it("does nothing when both are off", async () => {
    expect(await applyBookends(id, "none.mp4", { intro: { mode: "off" }, outro: { mode: "off" }, fade: "short" }, bookendDir(id))).toEqual({ applied: [] });
  });
});
