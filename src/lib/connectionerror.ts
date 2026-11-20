/**
 * Tell "cannot reach the server" from "the connection dropped mid-request".
 *
 * Node's fetch and the OpenAI SDK both wrap the socket error, so the code that
 * says what happened sits one or two levels down the cause chain:
 *
 *   APIConnectionError "Connection error."
 *     └ TypeError "fetch failed"
 *         └ Error "read ECONNRESET" { code: "ECONNRESET" }
 *
 * Looking only at the top error (or its message) cannot tell a wrong endpoint
 * from a socket Azure closed halfway through a slow image generation, so both
 * used to be reported as "check AZURE_OPENAI_ENDPOINT".
 *
 * Pure and import-free so it can be used from routes, helpers and tests.
 */

/** Never reached the server: wrong host, DNS, refused, no route, TLS or proxy trouble. */
export type NetworkFailure = "unreachable" | "dropped";

const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EHOSTDOWN",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UND_ERR_PRX_TLS",
]);

/** The connection existed or could have: it was cut, stalled or timed out. */
const DROPPED_CODES = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
  "UND_ERR_DESTROYED",
  "UND_ERR_ABORTED",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "ERR_SSL_BAD_RECORD_MAC",
  "ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC",
]);

const CODE_IN_MESSAGE = /\b(E[A-Z_]{3,}|UND_ERR_[A-Z_]+|CERT_[A-Z_]+|[A-Z_]*SELF_SIGNED[A-Z_]*|UNABLE_TO_[A-Z_]+|ERR_TLS_[A-Z_]+)\b/g;

const DROPPED_NAMES = /^(APIConnectionTimeoutError|TimeoutError|AbortError|HeadersTimeoutError|BodyTimeoutError|ConnectTimeoutError|SocketError)$/;
const DROPPED_MESSAGE =
  /socket hang up|other side closed|socket (?:was )?closed|network socket disconnected|premature close|request timed out|stream timeout|^\s*terminated\s*$/i;
const UNREACHABLE_MESSAGE = /connection error|fetch failed|ECONNREFUSED|ENOTFOUND|getaddrinfo/i;

type Node = { name?: unknown; message?: unknown; code?: unknown; status?: unknown };

/** The SDK's error classes never set `name`, so fall back to the class name. */
const nameOf = (n: Node): string => {
  if (typeof n.name === "string" && n.name !== "Error") return n.name;
  const ctor = (n as { constructor?: { name?: unknown } }).constructor?.name;
  return typeof ctor === "string" ? ctor : typeof n.name === "string" ? n.name : "";
};

/** The error and everything it wraps, outermost first. Bounded, and safe against cycles. */
export function causeChain(e: unknown, limit = 8): Node[] {
  const out: Node[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [e];
  while (queue.length && out.length < limit) {
    const x = queue.shift();
    if (x === null || x === undefined || seen.has(x)) continue;
    seen.add(x);
    if (typeof x !== "object") {
      out.push({ message: String(x) });
      continue;
    }
    out.push(x as Node);
    const wrapped = x as { cause?: unknown; errors?: unknown };
    if (wrapped.cause !== undefined) queue.push(wrapped.cause);
    if (Array.isArray(wrapped.errors)) queue.push(...wrapped.errors);
  }
  return out;
}

const textOf = (n: Node) => (typeof n.message === "string" ? n.message : "");

function codeOf(n: Node): string | undefined {
  if (typeof n.code === "string" && n.code) return n.code;
  const m = textOf(n).match(CODE_IN_MESSAGE);
  return m?.find((c) => UNREACHABLE_CODES.has(c) || DROPPED_CODES.has(c));
}

/** The most specific errno-style code anywhere in the chain, for logs and messages. */
export function networkErrorCode(e: unknown): string | undefined {
  for (const n of causeChain(e)) {
    const c = codeOf(n);
    if (c && (UNREACHABLE_CODES.has(c) || DROPPED_CODES.has(c) || /^UND_ERR_/.test(c))) return c;
  }
  return undefined;
}

/**
 * "unreachable" when the endpoint could not be resolved or connected to,
 * "dropped" when a connection was lost or timed out mid-request, null when
 * this is not a transport failure at all (an HTTP error reply, a bug, a
 * validation error).
 *
 * A bare "Connection error." or "fetch failed" that carries no cause cannot be
 * told apart, and stays "unreachable", as it always was.
 */
export function classifyNetworkError(e: unknown): NetworkFailure | null {
  const chain = causeChain(e);
  if (!chain.length) return null;
  // A caller who cancelled the request is not a network failure.
  if (chain.some((n) => nameOf(n) === "APIUserAbortError")) return null;
  // The server answered: whatever happened, it was not the connection.
  if (chain.some((n) => typeof n.status === "number" && n.status >= 100 && n.status <= 599)) return null;

  for (const n of chain) {
    const code = codeOf(n);
    if (!code) continue;
    if (UNREACHABLE_CODES.has(code)) return "unreachable";
    if (DROPPED_CODES.has(code)) return "dropped";
  }
  for (const n of chain) {
    if (typeof n.code === "string" && /^UND_ERR_(?!INVALID|NOT_SUPPORTED|REQ|RES|INFO|BODY_NOT|MAX_|PRX)/.test(n.code)) {
      return "dropped";
    }
  }
  for (const n of chain) {
    if (DROPPED_NAMES.test(nameOf(n)) || DROPPED_MESSAGE.test(textOf(n))) {
      return "dropped";
    }
  }
  return chain.some((n) => UNREACHABLE_MESSAGE.test(textOf(n))) ? "unreachable" : null;
}

/** Marks a failure that happened after the server had already replied, so repeating the call could bill twice. */
export function markAfterResponse<T extends Error>(e: T): T {
  return Object.assign(e, { afterResponse: true });
}

export const failedAfterResponse = (e: unknown): boolean =>
  causeChain(e).some((n) => (n as { afterResponse?: unknown }).afterResponse === true);
