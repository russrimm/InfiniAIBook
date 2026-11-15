import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/route";
import { middleware } from "@/middleware";

const call = (path: string, host: string, method = "GET") =>
  middleware(new NextRequest(`http://${host}${path}`, { method, headers: { host } }));

afterEach(() => {
  delete process.env.INFINIAIBOOK_PASSWORD;
  delete process.env.ALLOWED_HOSTS;
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports ok with nothing but a status", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 without leaking the error when the database is unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      db: {
        prepare: () => {
          throw new Error("unable to open /secret/path/infiniaibook.db");
        },
      },
    }));
    const { GET: failing } = await import("@/app/api/health/route");
    vi.doUnmock("@/lib/db");
    const res = await failing();
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).toBe('{"status":"unavailable"}');
  });
});

describe("middleware and /api/health", () => {
  it("serves it to loopback probes when no password is set", async () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000"]) {
      expect((await call("/api/health", host)).status).toBe(200);
    }
  });

  it("serves it without a session when a password is set", async () => {
    process.env.INFINIAIBOOK_PASSWORD = "hunter2";
    const res = await call("/api/health", "app.example.com");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("serves it under any Host, as platform probes use pod addresses", async () => {
    process.env.ALLOWED_HOSTS = "notes.example.com";
    expect((await call("/api/health", "10.0.0.7:3000")).status).toBe(200);
    expect((await call("/api/health", "10.0.0.7:3000", "HEAD")).status).toBe(200);
  });

  it("keeps every other route protected", async () => {
    expect((await call("/api/notebooks", "10.0.0.7:3000")).status).toBe(403);
    process.env.INFINIAIBOOK_PASSWORD = "hunter2";
    expect((await call("/api/notebooks", "app.example.com")).status).toBe(401);
    expect((await call("/api/healthz", "app.example.com")).status).toBe(401);
    expect((await call("/api/health/extra", "app.example.com")).status).toBe(401);
  });

  it("does not exempt writes to the same path", async () => {
    process.env.INFINIAIBOOK_PASSWORD = "hunter2";
    expect((await call("/api/health", "app.example.com", "POST")).status).toBe(401);
  });
});
