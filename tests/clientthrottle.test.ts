import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { proxy } from "@/proxy";
import { ClientThrottle, authThrottle, clientKey } from "@/lib/clientthrottle";
import { FailureThrottle } from "@/lib/throttle";

const ENV_KEYS = ["INFINIAIBOOK_PASSWORD", "INFINIAIBOOK_API_TOKEN", "TRUST_PROXY"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const headers = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("clientKey", () => {
  it("cannot tell clients apart without a trusted proxy, so they share one bucket", () => {
    delete process.env.TRUST_PROXY;
    expect(clientKey(headers("203.0.113.9"))).toBe("direct");
  });

  it("trusts only the last X-Forwarded-For entry, which the proxy appended", () => {
    process.env.TRUST_PROXY = "true";
    expect(clientKey(headers("203.0.113.9"))).toBe("203.0.113.9");
    // Whatever the client put first is ignored, so rotating it does not dodge the limit.
    expect(clientKey(headers("1.1.1.1, 2.2.2.2, 203.0.113.9"))).toBe("203.0.113.9");
    expect(clientKey(headers("2001:DB8::1"))).toBe("2001:db8::1");
  });

  it("falls back to the shared bucket for a missing or odd header", () => {
    process.env.TRUST_PROXY = "true";
    expect(clientKey(headers())).toBe("direct");
    expect(clientKey(headers("not an address"))).toBe("direct");
    expect(clientKey(headers("a".repeat(100)))).toBe("direct");
  });
});

describe("ClientThrottle", () => {
  const quick = () => new FailureThrottle(100, 1000, async () => {});

  it("gives each client its own queue and failure count", () => {
    const t = new ClientThrottle(quick);
    expect(t.forClient("a")).toBe(t.forClient("a"));
    expect(t.forClient("a")).not.toBe(t.forClient("b"));
  });

  it("does not make one client wait behind another's failures", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const t = new ClientThrottle(() => new FailureThrottle(100, 1000, () => held));
    const slowFailure = t.forClient("attacker").attempt(() => false);
    // The attacker's queue is held for its back-off; another client is checked at once.
    await expect(t.forClient("owner").attempt(() => true)).resolves.toBe(true);
    release();
    await expect(slowFailure).resolves.toBe(false);
  });

  it("keeps the table bounded, dropping clients with no failures before ones being slowed down", async () => {
    const t = new ClientThrottle(quick, 3);
    await t.forClient("guesser").attempt(() => false);
    await t.forClient("ok-1").attempt(() => true);
    await t.forClient("ok-2").attempt(() => true);
    t.forClient("newcomer");
    expect(t.size).toBe(3);
    expect(t.forClient("guesser").consecutiveFailures).toBe(1);
  });

  it("starts a client over after a long quiet spell", async () => {
    let now = 0;
    const t = new ClientThrottle(quick, 10, 128, () => now);
    await t.forClient("a").attempt(() => false);
    expect(t.forClient("a").consecutiveFailures).toBe(1);
    now += 16 * 60_000;
    expect(t.forClient("a").consecutiveFailures).toBe(0);
  });

  it("reports overload when too many attempts are waiting overall", () => {
    const t = new ClientThrottle(() => new FailureThrottle(100, 1000, () => new Promise(() => {})), 10, 3);
    for (const id of ["a", "b", "c"]) void t.forClient(id).attempt(() => false);
    expect(t.overloaded).toBe(true);
  });
});

describe("sign-in behind a trusted proxy", () => {
  const signIn = (password: string, ip: string) =>
    login(
      new Request("https://example.com/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ password }),
      })
    );

  it("lets the owner sign in while another address is being slowed down", async () => {
    process.env.INFINIAIBOOK_PASSWORD = "correct horse";
    process.env.TRUST_PROXY = "true";
    vi.useFakeTimers();
    // The guesser's failed attempt sleeps for its back-off; the timers are never advanced.
    const guess = signIn("wrong", "198.51.100.1");
    const res = await signIn("correct horse", "203.0.113.5");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("infiniaibook_auth=");
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await guess).status).toBe(401);
  });

  it("shares one throttle between the sign-in route and bearer-token attempts", async () => {
    process.env.INFINIAIBOOK_PASSWORD = "correct horse";
    process.env.INFINIAIBOOK_API_TOKEN = "script-token";
    process.env.TRUST_PROXY = "true";
    vi.useFakeTimers();
    const ip = "198.51.100.77";
    const bad = proxy(
      new NextRequest("https://example.com/api/notebooks", {
        headers: { host: "example.com", authorization: "Bearer nope", "x-forwarded-for": ip },
      })
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await bad).status).toBe(401);
    // The failed bearer counted against the same client the sign-in route sees.
    expect(authThrottle().forClient(ip).consecutiveFailures).toBe(1);
  });
});
