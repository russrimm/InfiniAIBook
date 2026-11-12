import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as authStatus } from "@/app/api/auth/status/route";
import { GET as budget } from "@/app/api/budget/route";
import { GET as voices } from "@/app/api/voices/route";
import { GET as voicePreview } from "@/app/api/voices/preview/route";
import { AUTH_COOKIE, verifySessionToken } from "@/lib/auth";
import { BudgetExceededError, reserve, spentTodayCents } from "@/lib/budget";
import { db } from "@/lib/db";
import { SpeechNotConfiguredError } from "@/lib/speech";
import { request } from "./routehelpers";

const mocks = vi.hoisted(() => ({
  loadVoiceCatalog: vi.fn(),
  voiceSample: vi.fn(),
  budgetStatus: vi.fn(),
}));

vi.mock("@/lib/voicelist", () => ({
  loadVoiceCatalog: mocks.loadVoiceCatalog,
  voiceSample: mocks.voiceSample,
}));
vi.mock("@/lib/budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/budget")>();
  mocks.budgetStatus.mockImplementation(actual.budgetStatus);
  return { ...actual, budgetStatus: (...args: Parameters<typeof actual.budgetStatus>) => mocks.budgetStatus(...args) };
});

const ENV_KEYS = ["INFINIAIBOOK_PASSWORD", "INFINIAIBOOK_SESSION_SECRET", "TRUST_PROXY", "DAILY_BUDGET_USD"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("auth routes", () => {
  const signIn = (password: unknown, url = "http://localhost/api/auth/login", headers: Record<string, string> = {}) =>
    login(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof password === "string" && password.startsWith("{") ? password : JSON.stringify({ password }),
      }),
    );

  /** A failed sign-in sleeps for its back-off, so the clock is advanced past it. */
  const failedSignIn = async (...args: Parameters<typeof signIn>) => {
    vi.useFakeTimers();
    const pending = signIn(...args);
    await vi.advanceTimersByTimeAsync(60_000);
    const res = await pending;
    vi.useRealTimers();
    return res;
  };

  describe("status", () => {
    it("reports whether a password is configured", async () => {
      delete process.env.INFINIAIBOOK_PASSWORD;
      expect(await (await authStatus()).json()).toEqual({ auth: false });
      process.env.INFINIAIBOOK_PASSWORD = "";
      expect(await (await authStatus()).json()).toEqual({ auth: false });
      process.env.INFINIAIBOOK_PASSWORD = "secret";
      expect(await (await authStatus()).json()).toEqual({ auth: true });
    });
  });

  describe("login", () => {
    it("does nothing and sets no cookie when no password is configured", async () => {
      delete process.env.INFINIAIBOOK_PASSWORD;
      const res = await signIn("anything");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, auth: false });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("signs in with the right password and sets a verifiable session cookie", async () => {
      process.env.INFINIAIBOOK_PASSWORD = "correct horse";
      const res = await signIn("correct horse");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE}=v2\\.`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=lax/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).toMatch(/Max-Age=2592000/);
      expect(cookie).not.toMatch(/Secure/i);
      expect(cookie).not.toContain("correct horse");
      const token = cookie.split(";")[0].slice(AUTH_COOKIE.length + 1);
      expect(await verifySessionToken(token, "correct horse")).toBe(true);
      expect(await verifySessionToken(token, "another password")).toBe(false);
    });

    it("marks the cookie Secure over HTTPS, directly or through a trusted proxy", async () => {
      process.env.INFINIAIBOOK_PASSWORD = "pw";
      const direct = await signIn("pw", "https://example.com/api/auth/login");
      expect(direct.headers.get("set-cookie")).toMatch(/Secure/i);

      const untrusted = await signIn("pw", "http://localhost/api/auth/login", { "x-forwarded-proto": "https" });
      expect(untrusted.headers.get("set-cookie")).not.toMatch(/Secure/i);

      process.env.TRUST_PROXY = "true";
      const proxied = await signIn("pw", "http://localhost/api/auth/login", { "x-forwarded-proto": "https" });
      expect(proxied.headers.get("set-cookie")).toMatch(/Secure/i);
    });

    it("rejects a wrong password with 401 and no cookie", async () => {
      process.env.INFINIAIBOOK_PASSWORD = "pw";
      const res = await failedSignIn("nope");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Wrong password." });
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it.each([
      ["a missing password", "{}"],
      ["an empty password", ""],
      ["a password that is not a string", "{\"password\":123}"],
      ["a body that is not JSON", "not json"],
    ])("rejects %s", async (_name, body) => {
      process.env.INFINIAIBOOK_PASSWORD = "pw";
      const res = await failedSignIn(body);
      expect(res.status).toBe(401);
    });

    it("refuses quickly with 429 when too many failed attempts are already waiting", async () => {
      process.env.INFINIAIBOOK_PASSWORD = "pw";
      vi.useFakeTimers();
      const waiting = Array.from({ length: 16 }, () => signIn("guess"));
      await vi.advanceTimersByTimeAsync(0);

      const refused = await signIn("pw");
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ code: "auth_throttled" });

      await vi.advanceTimersByTimeAsync(600_000);
      expect((await Promise.all(waiting)).every((r) => r.status === 401)).toBe(true);
      vi.useRealTimers();

      // A correct password still works once the queue has drained.
      expect((await signIn("pw")).status).toBe(200);
    });
  });

  describe("logout", () => {
    it("expires the session cookie", async () => {
      const res = await logout();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const cookie = res.headers.get("set-cookie")!;
      expect(cookie).toMatch(new RegExp(`^${AUTH_COOKIE}=;`));
      expect(cookie).toMatch(/Max-Age=0/);
      expect(cookie).toMatch(/HttpOnly/i);
    });
  });
});

describe("GET /api/budget", () => {
  beforeEach(() => {
    spentTodayCents();
    db.exec("DELETE FROM spend");
  });

  it("reports the ceiling as off when it is set to 0", async () => {
    process.env.DAILY_BUDGET_USD = "0";
    expect(await (await budget()).json()).toEqual({
      enabled: false,
      capCents: null,
      spentCents: 0,
      remainingCents: null,
    });
  });

  it("reports today's spend against the ceiling", async () => {
    process.env.DAILY_BUDGET_USD = "5";
    reserve("chat", 120);
    reserve("image", 30);
    expect(await (await budget()).json()).toEqual({
      enabled: true,
      capCents: 500,
      spentCents: 150,
      remainingCents: 350,
    });
  });

  it("never reports a negative remainder", async () => {
    process.env.DAILY_BUDGET_USD = "1";
    reserve("chat", 100);
    expect(() => reserve("chat", 1)).toThrow(BudgetExceededError);
    expect((await (await budget()).json()).remainingCents).toBe(0);
  });

  it("reports an unexpected failure as a 500", async () => {
    mocks.budgetStatus.mockImplementationOnce(() => {
      throw new Error("database is locked");
    });
    const res = await budget();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "database is locked" });
  });

  it("maps an exceeded budget error to 429", async () => {
    mocks.budgetStatus.mockImplementationOnce(() => {
      throw new BudgetExceededError("Daily model budget reached");
    });
    const res = await budget();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Daily model budget reached", code: "budget" });
  });
});

describe("voices", () => {
  const catalog = {
    voices: [
      { id: "en-US-JennyNeural", name: "Jenny", gender: "Female", styles: ["cheerful", "sad"] },
      { id: "en-US-GuyNeural", name: "Guy", gender: "Male", styles: [] },
    ],
    live: true,
  };

  beforeEach(() => {
    mocks.loadVoiceCatalog.mockResolvedValue(catalog);
    mocks.voiceSample.mockResolvedValue(Buffer.from("mp3-bytes"));
  });

  it("lists the catalog and whether it came from the live service", async () => {
    expect(await (await voices()).json()).toEqual(catalog);
    mocks.loadVoiceCatalog.mockResolvedValue({ voices: [], live: false });
    expect(await (await voices()).json()).toEqual({ voices: [], live: false });
  });

  const preview = (query: string) => voicePreview(request(`/api/voices/preview${query}`));

  it.each([["a missing voice", ""], ["a malformed voice", "?voice=not%20a%20voice"], ["a voice with injected markup", "?voice=en-US-A%3Cb%3E"]])(
    "returns 400 for %s",
    async (_name, query) => {
      const res = await preview(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unknown voice." });
      expect(mocks.voiceSample).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a voice that is not on the live list", async () => {
    const res = await preview("?voice=en-US-AriaNeural");
    expect(res.status).toBe(404);
    expect(mocks.voiceSample).not.toHaveBeenCalled();
  });

  it("rejects a style the voice does not have, or one that is malformed", async () => {
    for (const style of ["angry", "Not Valid"]) {
      const res = await preview(`?voice=en-US-JennyNeural&style=${encodeURIComponent(style)}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "That voice has no such style." });
    }
    expect(mocks.voiceSample).not.toHaveBeenCalled();
  });

  it("rejects an introduction name that is not letters only", async () => {
    for (const name of ["Ava1", "<ssml>", "A".repeat(25)]) {
      const res = await preview(`?voice=en-US-JennyNeural&as=${encodeURIComponent(name)}`);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid name." });
    }
  });

  it("returns an MP3 sample for a valid voice, style and name", async () => {
    const res = await preview("?voice=en-US-JennyNeural&style=cheerful&as=Jenny");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-length")).toBe(String("mp3-bytes".length));
    expect(res.headers.get("cache-control")).toBe("private, max-age=604800");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("mp3-bytes");
    expect(mocks.voiceSample).toHaveBeenCalledExactlyOnceWith("en-US-JennyNeural", "cheerful", "Jenny");
  });

  it("renders a neutral sample when no style or name is given", async () => {
    await preview("?voice=en-US-GuyNeural");
    expect(mocks.voiceSample).toHaveBeenCalledExactlyOnceWith("en-US-GuyNeural", undefined, undefined);
  });

  it("reports missing Speech configuration as 501 and other failures as 502", async () => {
    mocks.voiceSample.mockRejectedValueOnce(new SpeechNotConfiguredError("Configure Speech first"));
    const notConfigured = await preview("?voice=en-US-JennyNeural");
    expect(notConfigured.status).toBe(501);
    expect(await notConfigured.json()).toEqual({ error: "Configure Speech first" });

    mocks.voiceSample.mockRejectedValueOnce(new Error("Speech service timed out"));
    const failed = await preview("?voice=en-US-JennyNeural");
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Speech service timed out" });
  });
});
