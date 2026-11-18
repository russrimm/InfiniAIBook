import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { trainingClipPath, trainingRasterPath } from "@/lib/paths";
import { clipDuration, sectionClipHash, sectionSsml } from "@/lib/trainingtiming";
import type { TrainingContent } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/lib/avatarbatch", () => ({
  avatarConfigured: () => true,
  avatarNotConfigured: () => new Error("not configured"),
  avatarFailureReason: async () => "failed",
  avatarPollDelayMs: (base: number) => base,
  submitAvatarJob: mocks.submit,
  getAvatarJob: mocks.get,
  deleteAvatarJob: mocks.del,
  downloadAvatarResult: mocks.download,
}));

import { missingRasters, readTraining, startTrainingRender } from "@/lib/trainingbuild";

const RATE_LIMIT =
  "Azure Speech is rate limiting avatar requests, so it could not start the avatar render and kept refusing after 7 attempts over 120 seconds.";
const rateLimited = () => Object.assign(new Error(RATE_LIMIT), { status: 429 });

const notebook = nanoid(8);
db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(notebook, "N", "📓", 1);

function video(): { id: string; content: TrainingContent } {
  const id = nanoid(10);
  const content = {
    title: "Rate limits",
    objectives: [],
    sections: [
      { title: "One", text: "The first section has some words to say." },
      { title: "Two", text: "The second section says something else entirely." },
    ],
    presenter: "lisa",
    voice: "",
    background: "#112233",
    composition: { mode: "composed", intro: false, sectionCards: false },
    progress: { stage: "transcript" },
  } as unknown as TrainingContent;
  db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)").run(
    id,
    notebook,
    "training",
    content.title,
    JSON.stringify(content),
    1,
  );
  // The browser draws visuals before a composed render; stand in for it.
  for (const m of missingRasters(id, content)) {
    const file = trainingRasterPath(id, m.key, m.state);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "png");
  }
  return { id, content };
}
async function settle(id: string, until: () => boolean = () => false) {
  for (let i = 0; i < 120; i++) {
    const stage = readTraining(id)?.progress.stage;
    if (until() || stage === "failed" || stage === "composing") return;
    await vi.advanceTimersByTimeAsync(1_000);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  for (const m of Object.values(mocks)) m.mockReset();
  mocks.del.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("composed render under an Azure Speech rate limit", () => {
  it("keeps finished sections and fails with the actionable message when nothing else can run", async () => {
    const { id, content } = video();
    const first = sectionSsml(content, 0);
    mocks.submit.mockImplementation(async (_id: string, ssml: string) => {
      if (ssml === first) return { id: "a", status: "NotStarted" };
      throw rateLimited();
    });
    mocks.get.mockResolvedValue({
      id: "a",
      status: "Succeeded",
      outputs: { result: "https://blob.example.test/clip.webm" },
      properties: { durationInMilliseconds: 4000 },
    });
    mocks.download.mockImplementation(async (_url: string, file: string) => {
      fs.writeFileSync(file, "clip");
      return 4;
    });

    await startTrainingRender(id);
    await settle(id);

    const after = readTraining(id)!;
    expect(after.progress.stage).toBe("failed");
    expect(after.progress.note).toBe(RATE_LIMIT);
    // The section that finished is cached on disk and was not deleted or re-requested.
    const hash = sectionClipHash(content, 0);
    expect(fs.existsSync(trainingClipPath(id, hash))).toBe(true);
    expect(clipDuration(id, hash)).toBe(4);
    expect(after.progress.clips?.[0].status).toBe("done");
    expect(after.progress.clips?.[1].status).toBe("pending");

    // Pressing Render again asks Azure only for the section that is missing.
    mocks.submit.mockReset();
    mocks.submit.mockRejectedValue(rateLimited());
    await startTrainingRender(id);
    await settle(id);
    const ssmls = mocks.submit.mock.calls.map((c) => c[1]);
    expect(ssmls.length).toBeGreaterThan(0);
    expect(ssmls.every((s) => s === sectionSsml(content, 1))).toBe(true);
    expect(readTraining(id)!.progress.note).toBe(RATE_LIMIT);
  });

  it("keeps sections that are already rendering while it waits for the limit to ease", async () => {
    const { id, content } = video();
    const first = sectionSsml(content, 0);
    let refusals = 0;
    mocks.submit.mockImplementation(async (_id: string, ssml: string) => {
      if (ssml === first) return { id: "a", status: "NotStarted" };
      if (++refusals < 3) throw rateLimited();
      return { id: "b", status: "NotStarted" };
    });
    let polls = 0;
    mocks.get.mockImplementation(async () =>
      ++polls < 3
        ? { id: "a", status: "Running" }
        : {
            id: "x",
            status: "Succeeded",
            outputs: { result: "https://blob.example.test/clip.webm" },
            properties: { durationInMilliseconds: 2000 },
          },
    );
    mocks.download.mockImplementation(async (_url: string, file: string) => {
      fs.writeFileSync(file, "clip");
      return 4;
    });

    await startTrainingRender(id);
    // While the second section is refused, the first keeps rendering and the card says why.
    await settle(id, () => refusals >= 1);
    expect(readTraining(id)!.progress.stage).not.toBe("failed");
    expect(readTraining(id)!.progress.note).toMatch(/rate limiting new avatar jobs/);
    expect(mocks.del).not.toHaveBeenCalled();

    await settle(id, () => refusals >= 3);
    expect(refusals).toBe(3);
    expect(readTraining(id)!.progress.stage).not.toBe("failed");
    expect(mocks.submit).toHaveBeenCalledTimes(4);
    // Deleting the artifact ends the watcher, so it does not go on to compose.
    db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    await vi.advanceTimersByTimeAsync(20_000);
  });

  it("does not call a 400 from Azure a rate limit", async () => {
    const { id } = video();
    mocks.submit.mockRejectedValue(Object.assign(new Error("Azure Speech could not start the avatar render (400)."), { status: 400 }));
    await startTrainingRender(id);
    await settle(id);
    expect(readTraining(id)!.progress.stage).toBe("failed");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(readTraining(id)!.progress.note).toMatch(/\(400\)/);
  });
});

describe("single-video render under an Azure Speech rate limit", () => {
  it("returns to the transcript with the actionable message and rethrows it", async () => {
    const id = nanoid(10);
    const content = {
      title: "Single",
      objectives: [],
      sections: [{ title: "One", text: "Some words for the presenter to say." }],
      presenter: "lisa",
      voice: "",
      background: "#112233",
      progress: { stage: "transcript" },
    };
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)").run(
      id,
      notebook,
      "training",
      "Single",
      JSON.stringify(content),
      1,
    );
    mocks.submit.mockRejectedValue(rateLimited());
    await expect(startTrainingRender(id)).rejects.toMatchObject({ status: 429 });
    const after = readTraining(id)!;
    expect(after.progress.stage).toBe("transcript");
    expect(after.progress.note).toBe(RATE_LIMIT);
  });
});
