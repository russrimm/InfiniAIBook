import { describe, expect, it } from "vitest";
import { FailureThrottle } from "@/lib/throttle";

describe("FailureThrottle", () => {
  it("backs off exponentially up to a cap", () => {
    const t = new FailureThrottle(600, 30_000, async () => {});
    expect(t.backoffMs(0)).toBe(0);
    expect(t.backoffMs(1)).toBe(600);
    expect(t.backoffMs(2)).toBe(1200);
    expect(t.backoffMs(20)).toBe(30_000);
  });

  it("serialises attempts and holds the queue after each failure", async () => {
    const sleeps: number[] = [];
    const order: string[] = [];
    const t = new FailureThrottle(100, 1000, async (ms) => {
      sleeps.push(ms);
      order.push(`sleep ${ms}`);
    });
    const results = await Promise.all([
      t.attempt(() => (order.push("a"), false)),
      t.attempt(() => (order.push("b"), false)),
      t.attempt(() => (order.push("c"), true)),
    ]);
    expect(results).toEqual([false, false, true]);
    expect(sleeps).toEqual([100, 200]);
    // Each guess waits for the previous failure's delay before it is checked.
    expect(order).toEqual(["a", "sleep 100", "b", "sleep 200", "c"]);
    expect(t.consecutiveFailures).toBe(0);
  });

  it("keeps working after a check throws", async () => {
    const t = new FailureThrottle(1, 1, async () => {});
    await expect(
      t.attempt(() => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(await t.attempt(() => true)).toBe(true);
  });

  it("reports saturation so callers can refuse instead of queueing forever", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const t = new FailureThrottle(1, 1, () => gate, 2);
    expect(t.saturated).toBe(false);
    const a = t.attempt(() => false);
    const b = t.attempt(() => false);
    expect(t.saturated).toBe(true);
    release();
    await Promise.all([a, b]);
    expect(t.saturated).toBe(false);
  });
});
