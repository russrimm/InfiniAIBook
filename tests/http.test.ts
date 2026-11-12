import { afterEach, describe, expect, it, vi } from "vitest";
import { fail, noSourcesSelected, nowMs, ok } from "@/lib/http";
import { BudgetExceededError } from "@/lib/budget";
import { MissingConfigError } from "@/lib/ai";
import { SourceBoundaryError } from "@/lib/artifactsources";
import { mb } from "@/lib/limits";

afterEach(() => vi.restoreAllMocks());

describe("ok", () => {
  it("defaults to 200 and accepts a status", async () => {
    const a = ok({ a: 1 });
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({ a: 1 });
    expect(ok({}, 201).status).toBe(201);
  });
});

describe("fail", () => {
  it("maps typed errors to their status and code", async () => {
    const cases: [unknown, number, string][] = [
      [new SourceBoundaryError("bad sources"), 400, "invalid_sources"],
      [new BudgetExceededError("over budget"), 429, "budget"],
      [new MissingConfigError("no key"), 400, "no_config"],
    ];
    for (const [err, status, code] of cases) {
      const res = fail(err);
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ code });
    }
  });

  it("reports an unrecognized error as a 500 with its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = fail(new Error("kaput"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "kaput" });

    const odd = fail("string thrown");
    expect(await odd.json()).toEqual({ error: "Unexpected error" });
  });

  it("does not leak a 500 for rate limits from the provider", async () => {
    const res = fail(Object.assign(new Error("Too many requests"), { status: 429 }));
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limit");
  });
});

describe("nowMs", () => {
  it("returns the current time in milliseconds", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    expect(nowMs()).toBe(1234);
  });
});

describe("noSourcesSelected", () => {
  it("rejects only an explicitly empty list", async () => {
    const res = noSourcesSelected([]);
    expect(res?.status).toBe(400);
    expect((await res!.json()).code).toBe("no_sources");
    expect(noSourcesSelected(undefined)).toBeNull();
    expect(noSourcesSelected(["a"])).toBeNull();
  });
});

describe("limits", () => {
  it("formats byte counts as megabytes with one decimal", () => {
    expect(mb(0)).toBe("0 MB");
    expect(mb(1024 * 1024)).toBe("1 MB");
    expect(mb(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
