import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPythonRenderer } from "@/lib/python";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

type Fake = EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };

function fakeChild(): Fake {
  const child = new EventEmitter() as Fake;
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  mocks.spawn.mockReturnValue(child);
  return child;
}

beforeEach(() => {
  mocks.spawn.mockReset();
  vi.stubEnv("PYTHON_BIN", "");
  vi.stubEnv("PYTHON_RENDER_TIMEOUT_MIN", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("runPythonRenderer", () => {
  it("runs the script under scripts/ with the config path and resolves on exit 0", async () => {
    vi.stubEnv("PYTHON_BIN", "py3");
    const child = fakeChild();
    const done = runPythonRenderer(["training", "render.py"], "cfg.json");
    child.emit("close", 0);
    await expect(done).resolves.toBeUndefined();
    expect(mocks.spawn).toHaveBeenCalledWith(
      "py3",
      [path.join(process.cwd(), "scripts", "training", "render.py"), "cfg.json"],
      { cwd: process.cwd() }
    );
  });

  it("falls back to `python` when PYTHON_BIN is unset", async () => {
    const child = fakeChild();
    const done = runPythonRenderer(["x.py"], "cfg.json");
    child.emit("close", 0);
    await done;
    expect(mocks.spawn.mock.calls[0][0]).toBe("python");
  });

  it("reports progress lines, including ones split across chunks, and keeps them out of the error", async () => {
    const child = fakeChild();
    const onProgress = vi.fn();
    const done = runPythonRenderer(["x.py"], "cfg.json", onProgress);
    child.stderr.emit("data", "frame 1/4\nfra");
    child.stderr.emit("data", "me 2/4\nTraceback: boom\n");
    child.emit("close", 1);
    await expect(done).rejects.toThrow(/exit 1\)\. Traceback: boom/);
    expect(onProgress.mock.calls).toEqual([[0.25], [0.5]]);
  });

  it("includes a last stderr line that has no trailing newline", async () => {
    const child = fakeChild();
    const done = runPythonRenderer(["x.py"], "cfg.json");
    child.stderr.emit("data", "ValueError: bad input");
    child.emit("close", 2);
    await expect(done).rejects.toThrow(/ValueError: bad input/);
  });

  it("explains how to fix a missing Python interpreter", async () => {
    vi.stubEnv("PYTHON_BIN", "no-such-python");
    const child = fakeChild();
    const done = runPythonRenderer(["x.py"], "cfg.json");
    child.emit("error", new Error("spawn ENOENT"));
    await expect(done).rejects.toThrow(/Could not start Python \("no-such-python"\).*numpy.*spawn ENOENT/);
  });

  it("kills a renderer that exceeds the time limit", async () => {
    vi.useFakeTimers();
    vi.stubEnv("PYTHON_RENDER_TIMEOUT_MIN", "2");
    const child = fakeChild();
    const done = runPythonRenderer(["x.py"], "cfg.json");
    const assertion = expect(done).rejects.toThrow("stopped after 2 minutes");
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit("close", null);
    await assertion;
  });

  it("ignores an invalid timeout and uses two hours", async () => {
    vi.useFakeTimers();
    vi.stubEnv("PYTHON_RENDER_TIMEOUT_MIN", "abc");
    const child = fakeChild();
    const done = runPythonRenderer(["x.py"], "cfg.json");
    await vi.advanceTimersByTimeAsync(119 * 60_000);
    expect(child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(child.kill).toHaveBeenCalledOnce();
    const assertion = expect(done).rejects.toThrow("120 minutes");
    child.emit("close", null);
    await assertion;
  });
});
