/**
 * Redirect handling in safeFetch, hop by hop.
 *
 * undici's fetch is replaced by a script of canned responses and the name
 * lookup is mocked, so each test controls exactly what the "remote" site says
 * and can see which URLs were actually requested. A destination the guard
 * refuses must never show up in that list.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ default: { lookup: dnsLookup } }));

const undiciFetch = vi.hoisted(() => vi.fn());
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: undiciFetch,
}));

const PUBLIC_IP = "93.184.215.14";

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

/** Answer each request in turn from `script`; a function is called with the URL. */
function script(...steps: (Response | ((url: string) => Response))[]) {
  let i = 0;
  undiciFetch.mockImplementation(async (url: string) => {
    const step = steps[Math.min(i++, steps.length - 1)];
    return typeof step === "function" ? step(url) : step.clone();
  });
}

const requested = () => undiciFetch.mock.calls.map((c) => c[0] as string);

async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/lib/safefetch");
}

beforeEach(() => {
  vi.unstubAllEnvs();
  undiciFetch.mockReset();
  dnsLookup.mockReset();
  dnsLookup.mockImplementation(async (host: string) => {
    if (host === "internal.test") return [{ address: "10.1.2.3", family: 4 }];
    if (host === "localhost" || host === "localhost.") return [{ address: "127.0.0.1", family: 4 }];
    if (host === "loopback.test") return [{ address: "127.0.0.1", family: 4 }];
    if (host === "v6loop.test") return [{ address: "::1", family: 6 }];
    if (host === "mapped.test") return [{ address: "::ffff:7f00:1", family: 6 }];
    if (host === "mixed.test") {
      return [
        { address: PUBLIC_IP, family: 4 },
        { address: "192.168.0.9", family: 4 },
      ];
    }
    return [{ address: PUBLIC_IP, family: 4 }];
  });
});

describe("a redirect into a private network", () => {
  const targets = [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://169.254.170.2/v2/credentials",
    "http://[fd00:ec2::254]/latest/meta-data/",
    "http://127.0.0.1/",
    "http://127.0.0.1:8080/admin",
    "http://127.1/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[::]/",
    "http://10.0.0.1/",
    "http://10.255.255.255/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.0.1/",
    "http://192.168.255.255/",
    "http://100.64.0.1/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    // IPv4 carried in IPv6, in the spellings new URL() can produce
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:a00:1]/",
    "http://[64:ff9b::7f00:1]/",
    // decimal, hex and octal spellings of loopback and the metadata address
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0x7f.0.0.1/",
    "http://017700000001/",
    "http://0177.0.0.1/",
    "http://0177.0.0.01/",
    "http://2852039166/",
    "http://0xa9fea9fe/",
    // names, and addresses reached through a name
    "http://localhost/",
    "http://localhost./",
    "http://internal.test/",
    "http://loopback.test/",
    "http://v6loop.test/",
    "http://mapped.test/",
    "http://mixed.test/",
    // userinfo and backslash tricks that put a private host after something harmless
    "http://example.com@127.0.0.1/",
    "http://example.com:80@10.0.0.1/",
    "http://127.0.0.1\\@example.com/",
    // scheme-relative and path-relative forms of the same thing
    "//127.0.0.1/",
    "//169.254.169.254/",
  ];

  for (const target of targets) {
    it(`refuses ${target} and never requests it`, async () => {
      const { safeFetch, BlockedHostError } = await load();
      script(redirect(target));
      await expect(safeFetch("https://public.example/")).rejects.toBeInstanceOf(BlockedHostError);
      expect(requested()).toEqual(["https://public.example/"]);
    });
  }

  it("refuses a private target reached on a later hop", async () => {
    const { safeFetch, BlockedHostError } = await load();
    script(
      redirect("https://a.example/1"),
      redirect("https://b.example/2", 301),
      redirect("http://169.254.169.254/", 307)
    );
    await expect(safeFetch("https://public.example/")).rejects.toBeInstanceOf(BlockedHostError);
    expect(requested()).toEqual(["https://public.example/", "https://a.example/1", "https://b.example/2"]);
  });

  it("checks every redirect status, not only 302", async () => {
    const { safeFetch, BlockedHostError } = await load();
    for (const status of [301, 302, 303, 307, 308]) {
      undiciFetch.mockReset();
      script(redirect("http://127.0.0.1/", status));
      await expect(safeFetch("https://public.example/"), String(status)).rejects.toBeInstanceOf(BlockedHostError);
      expect(requested()).toHaveLength(1);
    }
  });

  it("is not fooled by a private address in a later path or query", async () => {
    const { safeFetch } = await load();
    script(redirect("https://other.example/?next=http://127.0.0.1/#http://10.0.0.1/"), new Response("ok"));
    const { finalUrl } = await safeFetch("https://public.example/");
    expect(finalUrl).toBe("https://other.example/?next=http://127.0.0.1/#http://10.0.0.1/");
  });
});

describe("a redirect to another scheme", () => {
  for (const target of [
    "file:///etc/passwd",
    "file://localhost/etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com/file",
    "gopher://example.com/",
    "javascript:alert(1)",
    "ws://example.com/",
    "blob:https://example.com/00000000-0000-0000-0000-000000000000",
  ]) {
    it(`refuses ${target.slice(0, 40)}`, async () => {
      const { safeFetch, BlockedHostError } = await load();
      script(redirect(target));
      await expect(safeFetch("https://public.example/")).rejects.toBeInstanceOf(BlockedHostError);
      expect(requested()).toHaveLength(1);
    });
  }

  it("refuses a non-http address as the first URL, before any request", async () => {
    const { safeFetch, BlockedHostError } = await load();
    for (const url of ["file:///etc/passwd", "data:text/plain,hi", "ftp://example.com/", "gopher://example.com/"]) {
      await expect(safeFetch(url), url).rejects.toBeInstanceOf(BlockedHostError);
    }
    expect(requested()).toEqual([]);
  });

  it("refuses credentials in the first URL and in a redirect, before any request to them", async () => {
    const { safeFetch, BlockedHostError } = await load();
    await expect(safeFetch("https://user:pw@public.example/")).rejects.toBeInstanceOf(BlockedHostError);
    expect(requested()).toEqual([]);

    script(redirect("https://user:pw@other.example/"));
    await expect(safeFetch("https://public.example/")).rejects.toBeInstanceOf(BlockedHostError);
    expect(requested()).toEqual(["https://public.example/"]);
  });

  it("refuses a Location that is not a URL at all", async () => {
    const { safeFetch, BlockedHostError } = await load();
    script(redirect("http://[::1"));
    await expect(safeFetch("https://public.example/")).rejects.toBeInstanceOf(BlockedHostError);
  });
});

describe("redirect limits", () => {
  it("gives up on a loop after the default limit of five redirects", async () => {
    const { safeFetch, BlockedHostError } = await load();
    script(redirect("https://public.example/loop"));
    await expect(safeFetch("https://public.example/loop")).rejects.toThrow(/redirected too many times/);
    await expect(safeFetch("https://public.example/loop")).rejects.toBeInstanceOf(BlockedHostError);
    // the original request plus five redirects, per call
    expect(requested()).toHaveLength(12);
  });

  it("gives up on two sites that redirect to each other", async () => {
    const { safeFetch } = await load();
    script((url) => redirect(url.includes("a.example") ? "https://b.example/" : "https://a.example/"));
    await expect(safeFetch("https://a.example/")).rejects.toThrow(/redirected too many times/);
    expect(requested()).toHaveLength(6);
  });

  it("follows exactly the allowed number of redirects and returns the page after them", async () => {
    const { safeFetch } = await load();
    script(
      redirect("https://x.example/1"),
      redirect("https://x.example/2"),
      redirect("https://x.example/3"),
      redirect("https://x.example/4"),
      redirect("https://x.example/5"),
      new Response("done")
    );
    const { res, finalUrl } = await safeFetch("https://public.example/");
    expect(finalUrl).toBe("https://x.example/5");
    expect(await res.text()).toBe("done");
  });

  it("honors FETCH_MAX_REDIRECTS, including zero", async () => {
    const two = await load({ FETCH_MAX_REDIRECTS: "2" });
    script(redirect("https://public.example/loop"));
    await expect(two.safeFetch("https://public.example/")).rejects.toThrow(/too many times/);
    expect(requested()).toHaveLength(3);

    undiciFetch.mockReset();
    const none = await load({ FETCH_MAX_REDIRECTS: "0" });
    script(redirect("https://public.example/next"));
    await expect(none.safeFetch("https://public.example/")).rejects.toThrow(/too many times/);
    expect(requested()).toHaveLength(1);
  });

  it("does not follow a redirect status that has no Location", async () => {
    const { safeFetch } = await load();
    script(new Response(null, { status: 302 }));
    const { res } = await safeFetch("https://public.example/");
    expect(res.status).toBe(302);
    expect(requested()).toHaveLength(1);
  });

  it("asks undici for the redirect itself rather than letting it follow", async () => {
    const { safeFetch } = await load();
    script(new Response("ok"));
    await safeFetch("https://public.example/", { headers: { "x-test": "1" } });
    const init = undiciFetch.mock.calls[0][1] as { redirect: string; dispatcher: unknown };
    expect(init.redirect).toBe("manual");
    expect(init.dispatcher).toBeDefined();
  });
});

describe("addresses and ports on the first request", () => {
  it("does not restrict ports on a public address, and does not let one rescue a private one", async () => {
    const { safeFetch, BlockedHostError } = await load();
    script(new Response("ok"));
    await expect(safeFetch("https://public.example:8443/")).resolves.toBeDefined();
    await expect(safeFetch("http://public.example:8080/")).resolves.toBeDefined();
    await expect(safeFetch("http://127.0.0.1:8080/")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(safeFetch("http://[::1]:443/")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(safeFetch("http://localhost:3100/")).rejects.toBeInstanceOf(BlockedHostError);
  });

  it("refuses a name whose answers include a private address, even alongside a public one", async () => {
    const { safeFetch, BlockedHostError } = await load();
    await expect(safeFetch("http://mixed.test/")).rejects.toBeInstanceOf(BlockedHostError);
    expect(requested()).toEqual([]);
  });

  it("refuses a name that does not resolve", async () => {
    const { safeFetch, BlockedHostError } = await load();
    dnsLookup.mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    await expect(safeFetch("http://nope.test/")).rejects.toBeInstanceOf(BlockedHostError);
    dnsLookup.mockResolvedValue([]);
    await expect(safeFetch("http://empty.test/")).rejects.toBeInstanceOf(BlockedHostError);
    expect(requested()).toEqual([]);
  });
});

describe("the operator opt-out", () => {
  it("lets private addresses through only when ALLOW_PRIVATE_NETWORK_FETCH is set", async () => {
    const off = await load();
    await expect(off.safeFetch("http://127.0.0.1/")).rejects.toBeInstanceOf(off.BlockedHostError);

    const on = await load({ ALLOW_PRIVATE_NETWORK_FETCH: "true" });
    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("lan"));
    const { res } = await on.safeFetch("http://127.0.0.1/");
    expect(await res.text()).toBe("lan");
    // Non-http schemes stay refused even with the opt-out.
    await expect(on.safeFetch("file:///etc/passwd")).rejects.toBeInstanceOf(on.BlockedHostError);
    globalFetch.mockRestore();
  });
});
