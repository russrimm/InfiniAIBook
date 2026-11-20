import net from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import {
  causeChain,
  classifyNetworkError,
  failedAfterResponse,
  markAfterResponse,
  networkErrorCode,
} from "@/lib/connectionerror";

const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });
/** The shape the OpenAI SDK produces: APIConnectionError → TypeError(fetch failed) → errno error. */
const sdkError = (cause: unknown) => {
  const fetchFailed = new TypeError("fetch failed", { cause });
  class APIConnectionError extends Error {}
  return new APIConnectionError("Connection error.", { cause: fetchFailed });
};

describe("classifyNetworkError", () => {
  it.each([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "CERT_HAS_EXPIRED",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID",
  ])("treats %s under fetch failed as an endpoint that cannot be reached", (code) => {
    const e = new TypeError("fetch failed", { cause: withCode(`connect ${code}`, code) });
    expect(classifyNetworkError(e)).toBe("unreachable");
    expect(classifyNetworkError(sdkError(withCode(`connect ${code}`, code)))).toBe("unreachable");
  });

  it.each([
    "ECONNRESET",
    "ECONNABORTED",
    "EPIPE",
    "ETIMEDOUT",
    "UND_ERR_SOCKET",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_CLOSED",
    "UND_ERR_ABORTED",
  ])("treats %s as a connection that dropped or timed out", (code) => {
    const e = new TypeError("fetch failed", { cause: withCode("boom", code) });
    expect(classifyNetworkError(e)).toBe("dropped");
    expect(classifyNetworkError(sdkError(withCode("boom", code)))).toBe("dropped");
  });

  it("finds the code however deep the causes are wrapped, and in AggregateError members", () => {
    const deep = new Error("a", {
      cause: new Error("b", { cause: new TypeError("fetch failed", { cause: withCode("x", "ECONNRESET") }) }),
    });
    expect(classifyNetworkError(deep)).toBe("dropped");
    const aggregate = new TypeError("fetch failed", {
      cause: new AggregateError([withCode("connect ECONNREFUSED ::1:443", "ECONNREFUSED")], ""),
    });
    expect(classifyNetworkError(aggregate)).toBe("unreachable");
  });

  it("reads a code out of a message when it was not copied onto the error", () => {
    expect(classifyNetworkError(new Error("read ECONNRESET"))).toBe("dropped");
    expect(classifyNetworkError(new Error("getaddrinfo ENOTFOUND foo.openai.azure.com"))).toBe("unreachable");
  });

  it("recognizes timeouts, aborts and closed sockets that carry no code", () => {
    class APIConnectionTimeoutError extends Error {}
    expect(classifyNetworkError(new APIConnectionTimeoutError("Request timed out."))).toBe("dropped");
    expect(
      classifyNetworkError(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    ).toBe("dropped");
    expect(classifyNetworkError(new Error("socket hang up"))).toBe("dropped");
    expect(classifyNetworkError(new TypeError("terminated"))).toBe("dropped");
    expect(classifyNetworkError(new Error("other side closed"))).toBe("dropped");
  });

  it("keeps a bare connection error or fetch failure as unreachable, as before", () => {
    expect(classifyNetworkError(new Error("Connection error."))).toBe("unreachable");
    expect(classifyNetworkError(new TypeError("fetch failed"))).toBe("unreachable");
  });

  it("is not fooled by errors from a server that did answer, or by a cancelled request", () => {
    expect(
      classifyNetworkError(Object.assign(new Error("Image generation failed (500). timeout"), { status: 500 })),
    ).toBeNull();
    expect(classifyNetworkError(Object.assign(new Error("Too many requests"), { status: 429 }))).toBeNull();
    class APIUserAbortError extends Error {}
    expect(classifyNetworkError(new APIUserAbortError("Request was aborted."))).toBeNull();
    expect(classifyNetworkError(new Error("Unexpected token"))).toBeNull();
    expect(classifyNetworkError(undefined)).toBeNull();
    expect(classifyNetworkError("string thrown")).toBeNull();
  });

  it("survives circular causes", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;
    expect(causeChain(a)).toHaveLength(2);
    expect(classifyNetworkError(a)).toBeNull();
  });
});

describe("networkErrorCode", () => {
  it("names the innermost errno-style code", () => {
    expect(networkErrorCode(sdkError(withCode("x", "UND_ERR_SOCKET")))).toBe("UND_ERR_SOCKET");
    expect(networkErrorCode(new Error("plain"))).toBeUndefined();
  });
});

describe("failedAfterResponse", () => {
  it("is set only by markAfterResponse, including on wrapped causes", () => {
    expect(failedAfterResponse(new Error("x"))).toBe(false);
    const marked = markAfterResponse(new Error("x"));
    expect(failedAfterResponse(marked)).toBe(true);
    expect(failedAfterResponse(new Error("outer", { cause: marked }))).toBe(true);
  });
});

describe("real Node errors", () => {
  const servers: net.Server[] = [];
  const listen = (onConnect: (s: net.Socket) => void) =>
    new Promise<number>((resolve) => {
      const server = net.createServer(onConnect).listen(0, "127.0.0.1", () => {
        servers.push(server);
        resolve((server.address() as net.AddressInfo).port);
      });
    });
  afterAll(() => servers.forEach((s) => s.close()));

  const attempt = (port: number) =>
    fetch(`http://127.0.0.1:${port}/x`, { method: "POST", body: "{}" }).then(
      () => null,
      (e: unknown) => e,
    );

  it("a reset connection is dropped, not unreachable", async () => {
    const port = await listen((s) => s.once("data", () => s.resetAndDestroy()));
    expect(classifyNetworkError(await attempt(port))).toBe("dropped");
  });

  it("a connection closed without a reply is dropped", async () => {
    const port = await listen((s) => s.once("data", () => s.end()));
    expect(classifyNetworkError(await attempt(port))).toBe("dropped");
  });

  it("a port nothing listens on is unreachable", async () => {
    const port = await listen(() => {});
    await new Promise((r) => servers.pop()!.close(r));
    expect(classifyNetworkError(await attempt(port))).toBe("unreachable");
  });

  it("a host that does not resolve is unreachable", async () => {
    const e = await fetch("http://no-such-host.invalid/").then(() => null, (x: unknown) => x);
    expect(classifyNetworkError(e)).toBe("unreachable");
  });
});
