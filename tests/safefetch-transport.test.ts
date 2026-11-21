/**
 * The SSRF guard against the real HTTP transport (undici), not a stand-in.
 *
 * Local servers play the remote end and the name lookup is mocked, so nothing
 * here touches the network. These are the cases a transport upgrade could
 * quietly break: where a connection is allowed to go, how a body is read, and
 * whether giving up on a response actually closes the socket.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { fetch as undiciFetch } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dnsLookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ default: { lookup: dnsLookup } }));

import {
  BlockedHostError,
  DownloadTimeoutError,
  ResponseTooLargeError,
  readCapped,
  safeFetch,
} from "@/lib/safefetch";

const MB = 1024 * 1024;
const PUBLIC_IP = "93.184.215.14";

let server: http.Server;
let port = 0;
let handler: http.RequestListener = (_q, r) => r.end();
const requests: string[] = [];
const sockets = new Set<import("node:net").Socket>();

beforeAll(async () => {
  server = http.createServer((q, r) => {
    requests.push(q.url ?? "/");
    handler(q, r);
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const s of sockets) s.destroy();
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  requests.length = 0;
  dnsLookup.mockReset();
});

afterEach(() => {
  handler = (_q, r) => r.end();
});

describe("DNS rebinding", () => {
  // `localhost` really does resolve to loopback, so a connection that skipped
  // the pinned lookup would reach the test server and show up in `requests`.
  it("refuses a name that is public when checked and loopback when connected", async () => {
    // First lookup is assertPublicUrl, second is the connection's own.
    dnsLookup
      .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const err = await safeFetch(`http://localhost:${port}/secret`).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(BlockedHostError);
    expect((err as Error).message).toMatch(/127\.0\.0\.1.*private or local/);
    expect(requests).toEqual([]);
  });

  it("refuses a rebind to the cloud metadata address and to IPv6 loopback", async () => {
    for (const address of ["169.254.169.254", "::1", "::ffff:7f00:1", "fd00:ec2::254"]) {
      dnsLookup.mockReset();
      dnsLookup
        .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])
        .mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
      const err = await safeFetch(`http://localhost:${port}/`).then(
        () => null,
        (e: unknown) => e
      );
      expect(err, address).toBeInstanceOf(BlockedHostError);
    }
    expect(requests).toEqual([]);
  });

  it("refuses when only one of several answers is private at connect time", async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: PUBLIC_IP, family: 4 }])
      .mockResolvedValue([
        { address: PUBLIC_IP, family: 4 },
        { address: "10.0.0.7", family: 4 },
      ]);
    const err = await safeFetch(`http://localhost:${port}/`).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(BlockedHostError);
    expect(requests).toEqual([]);
  });
});

describe("URLs with credentials", () => {
  it("never sends a request for a URL that carries a username or password", async () => {
    dnsLookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
    await expect(safeFetch(`http://user:pass@cred.test:${port}/`)).rejects.toBeInstanceOf(BlockedHostError);
    await expect(safeFetch(`http://user@cred.test:${port}/`)).rejects.toBeInstanceOf(BlockedHostError);
    expect(requests).toEqual([]);
  });

  it("reads userinfo tricks by the host the URL parser finds, not the one it appears to name", async () => {
    // Host is 127.0.0.1 in every one of these, whatever the text before it says.
    for (const url of [
      "http://public.example@127.0.0.1/",
      "http://public.example:80@127.0.0.1/",
      "http://127.0.0.1#@public.example/",
      "http://127.0.0.1\\@public.example/",
      "http://127.0.0.1?@public.example/",
    ]) {
      dnsLookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
      await expect(safeFetch(url), url).rejects.toBeInstanceOf(BlockedHostError);
    }
    expect(requests).toEqual([]);
  });
});

describe("response size cap on the real transport", () => {
  async function get(path: string) {
    return undiciFetch(`http://127.0.0.1:${port}${path}`) as unknown as Promise<Response>;
  }

  it("refuses a declared length over the cap without reading the body", async () => {
    let written = 0;
    handler = (_q, r) => {
      r.writeHead(200, { "content-length": String(50 * MB) });
      const pump = () => {
        while (written < 50 * MB) {
          written += 64 * 1024;
          if (!r.write(Buffer.alloc(64 * 1024))) return void r.once("drain", pump);
        }
        r.end();
      };
      pump();
    };
    await expect(readCapped(await get("/"), 1 * MB)).rejects.toBeInstanceOf(ResponseTooLargeError);
    expect(written).toBeLessThan(10 * MB);
  });

  it("stops a chunked body (no Content-Length) once it passes the cap", async () => {
    let written = 0;
    handler = (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain" });
      const pump = () => {
        while (written < 100 * MB) {
          written += 64 * 1024;
          if (!r.write(Buffer.alloc(64 * 1024))) return void r.once("drain", pump);
        }
        r.end();
      };
      r.on("close", () => (written = Number.MAX_SAFE_INTEGER));
      pump();
    };
    const res = await get("/");
    expect(res.headers.get("content-length")).toBeNull();
    await expect(readCapped(res, 1 * MB)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("never returns more than the declared length when the server sends extra", async () => {
    handler = (q) => {
      // Node refuses to over-send a declared length, so the lie is made on the raw socket.
      const s = q.socket;
      s.write(
        "HTTP/1.1 200 OK\r\ncontent-length: 10\r\nconnection: close\r\n\r\n" + "a".repeat(10) + "b".repeat(2 * MB)
      );
      s.end();
    };
    const res = await get("/");
    const body = await readCapped(res, 1 * MB).then(
      (b) => b,
      (e: unknown) => e
    );
    // The transport cuts the body at the declared length (or errors); it never hands over the extra bytes.
    expect(Buffer.isBuffer(body) ? body.length : 0).toBeLessThanOrEqual(10);
  });
});

describe("compressed bodies", () => {
  async function get() {
    return undiciFetch(`http://127.0.0.1:${port}/`) as unknown as Promise<Response>;
  }

  const zeros = Buffer.alloc(96 * MB);

  it("counts bytes after gzip inflation, so a small file that expands past the cap is stopped", async () => {
    const bomb = zlib.gzipSync(zeros, { level: 9 });
    expect(bomb.length).toBeLessThan(1 * MB); // looks harmless by its declared length
    handler = (_q, r) => {
      r.writeHead(200, { "content-encoding": "gzip", "content-length": String(bomb.length) });
      r.end(bomb);
    };
    const res = await get();
    expect(Number(res.headers.get("content-length"))).toBeLessThan(1 * MB);
    await expect(readCapped(res, 2 * MB)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("does the same for brotli and deflate", async () => {
    for (const [encoding, bomb] of [
      ["br", zlib.brotliCompressSync(zeros, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 1 } })],
      ["deflate", zlib.deflateSync(zeros, { level: 9 })],
    ] as const) {
      handler = (_q, r) => {
        r.writeHead(200, { "content-encoding": encoding, "content-length": String(bomb.length) });
        r.end(bomb);
      };
      await expect(readCapped(await get(), 2 * MB), encoding).rejects.toBeInstanceOf(ResponseTooLargeError);
    }
  });

  it("still returns an ordinary compressed page under the cap", async () => {
    const page = zlib.gzipSync(Buffer.from("<p>hello</p>"));
    handler = (_q, r) => {
      r.writeHead(200, { "content-encoding": "gzip" });
      r.end(page);
    };
    expect((await readCapped(await get(), 1 * MB)).toString()).toBe("<p>hello</p>");
  });
});

describe("download deadline on the real transport", () => {
  it("stops a body that trickles one byte at a time, and closes the connection", async () => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    handler = (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain" });
      r.on("close", () => {
        closed = true;
        clearInterval(timer);
      });
      timer = setInterval(() => r.write("a"), 10);
    };
    const res = (await undiciFetch(`http://127.0.0.1:${port}/`)) as unknown as Response;
    const started = Date.now();
    await expect(readCapped(res, 25 * MB, 300)).rejects.toBeInstanceOf(DownloadTimeoutError);
    expect(Date.now() - started).toBeLessThan(3000);
    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 });
  });

  it("stops a server that sends headers and then nothing", async () => {
    handler = (_q, r) => {
      r.writeHead(200, { "content-type": "text/plain" });
      r.flushHeaders();
    };
    const res = (await undiciFetch(`http://127.0.0.1:${port}/`)) as unknown as Response;
    await expect(readCapped(res, 25 * MB, 200)).rejects.toBeInstanceOf(DownloadTimeoutError);
  });
});
