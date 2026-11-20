import { NextResponse } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { POST as cancelRoute } from "@/app/api/jobs/[id]/cancel/route";
import { db } from "@/lib/db";
import { generationReply } from "@/lib/keepalive";
import {
  JobCancelledError,
  cancelJob,
  cancellableDelay,
  endJob,
  isCancellation,
  isJobRunning,
  requestJob,
  startJob,
  throwIfCancelled,
} from "@/lib/jobs";
import { runPythonRenderer } from "@/lib/python";
import { cancelTrainingRender, readTraining } from "@/lib/trainingbuild";

afterEach(() => {
  delete process.env.PYTHON_BIN;
});

describe("job registry", () => {
  it("cancels a running job once, and ends only its own registration", () => {
    const signal = startJob("job-registry-1");
    expect(isJobRunning("job-registry-1")).toBe(true);
    expect(cancelJob("job-registry-1")).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(JobCancelledError);
    endJob("job-registry-1", signal);
    expect(isJobRunning("job-registry-1")).toBe(false);
    expect(cancelJob("job-registry-1")).toBe(false);
  });

  it("cancels the earlier run when the same id starts again, and keeps the newer one", () => {
    const first = startJob("job-registry-2");
    const second = startJob("job-registry-2");
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
    endJob("job-registry-2", first);
    expect(isJobRunning("job-registry-2")).toBe(true);
    endJob("job-registry-2", second);
  });

  it("recognizes cancellations and stops waits at once", async () => {
    expect(isCancellation(new JobCancelledError())).toBe(true);
    expect(isCancellation(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isCancellation(new Error("boom"))).toBe(false);

    const controller = new AbortController();
    const started = Date.now();
    const wait = cancellableDelay(30_000, controller.signal);
    controller.abort();
    await expect(wait).rejects.toBeInstanceOf(JobCancelledError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(() => throwIfCancelled(controller.signal)).toThrow(JobCancelledError);
    expect(() => throwIfCancelled(undefined)).not.toThrow();
  });

  it("only registers a job when the request carries a valid x-job-id", () => {
    const none = requestJob(new Request("http://x/"));
    expect(isJobRunning("anything")).toBe(false);
    none.end();
    const bad = requestJob(new Request("http://x/", { headers: { "x-job-id": "../../etc" } }));
    bad.end();
    const real = requestJob(new Request("http://x/", { headers: { "x-job-id": "abcdef0123456789" } }));
    expect(isJobRunning("abcdef0123456789")).toBe(true);
    real.end();
    expect(isJobRunning("abcdef0123456789")).toBe(false);
  });
});

describe("cancelling a generation request", () => {
  it("stops the work and answers 499 'cancelled', without waiting for the browser connection", async () => {
    const req = new Request("http://localhost/api/generate", { method: "POST", headers: { "x-job-id": "gen-cancel-0001" } });
    const reply = Promise.resolve(
      generationReply(req, async (_report, signal) => {
        await cancellableDelay(30_000, signal);
        return NextResponse.json({ saved: true });
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    const res = await cancelRoute(new Request("http://localhost/api/jobs/gen-cancel-0001/cancel", { method: "POST" }), {
      params: Promise.resolve({ id: "gen-cancel-0001" }),
    });
    expect(((await res.json()) as { cancelled: boolean }).cancelled).toBe(true);
    const out = await reply;
    expect(out.status).toBe(499);
    expect(((await out.json()) as { code: string }).code).toBe("cancelled");
    expect(isJobRunning("gen-cancel-0001")).toBe(false);
  });

  it("reports false when nothing is running, and refuses a malformed id", async () => {
    const none = await cancelRoute(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "finished-already" }) });
    expect(((await none.json()) as { cancelled: boolean }).cancelled).toBe(false);
    const bad = await cancelRoute(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: "../../x" }) });
    expect(bad.status).toBe(400);
  });
});

describe("renderer processes", () => {
  it("kills a running renderer when cancelled", async () => {
    process.env.PYTHON_BIN = process.execPath;
    const controller = new AbortController();
    const started = Date.now();
    const run = runPythonRenderer(["..", "tests", "fixtures", "slow-renderer.mjs"], "config.json", undefined, controller.signal);
    setTimeout(() => controller.abort(), 300);
    await expect(run).rejects.toBeInstanceOf(JobCancelledError);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("never starts a renderer that was cancelled before it began", async () => {
    process.env.PYTHON_BIN = process.execPath;
    const controller = new AbortController();
    controller.abort();
    await expect(
      runPythonRenderer(["..", "tests", "fixtures", "slow-renderer.mjs"], "config.json", undefined, controller.signal),
    ).rejects.toBeInstanceOf(JobCancelledError);
  });
});

describe("cancelling a training render", () => {
  const insert = (id: string, progress: Record<string, unknown>, videoUrl?: string) =>
    db
      .prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, "nb", "training", "T", JSON.stringify({ title: "T", sections: [{ title: "a", text: "hello" }], progress, ...(videoUrl ? { videoUrl } : {}) }), 1);

  it("returns a submitted render to its transcript, with a note, and keeps cached clips", () => {
    db.exec("PRAGMA foreign_keys = OFF");
    insert("train-cancel-1", {
      stage: "rendering",
      clips: [
        { hash: "a", status: "cached" },
        { hash: "b", status: "rendering", synthesisId: "job-b" },
      ],
    });
    expect(cancelTrainingRender("train-cancel-1")).toBe(true);
    const c = readTraining("train-cancel-1")!;
    expect(c.progress.stage).toBe("transcript");
    expect(c.progress.note).toMatch(/cancelled/i);
    expect(c.progress.clips).toEqual([
      { hash: "a", status: "cached" },
      { hash: "b", status: "pending" },
    ]);
  });

  it("goes back to done when an earlier render exists, and ignores a video that is not rendering", () => {
    insert("train-cancel-2", { stage: "composing" }, "/api/video/train-cancel-2");
    expect(cancelTrainingRender("train-cancel-2")).toBe(true);
    expect(readTraining("train-cancel-2")!.progress.stage).toBe("done");
    insert("train-cancel-3", { stage: "transcript" });
    expect(cancelTrainingRender("train-cancel-3")).toBe(false);
    expect(cancelTrainingRender("no-such-video")).toBe(false);
  });
});
