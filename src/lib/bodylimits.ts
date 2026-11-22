import { MAX_UPLOAD_BYTES, mb } from "./limits";

/**
 * Request body limits.
 *
 * Next.js buffers a request body in memory before a route sees it, up to
 * `proxyClientMaxBodySize` (about 200 MB, see next.config.ts), so without a
 * limit of its own every route would accept that much. Two layers fix it:
 *
 *  - `declaredBodyProblem` runs in the proxy (src/proxy.ts) on every API
 *    request and refuses by `Content-Length` alone, before anything is read.
 *  - `limitBody` and the `read*` helpers run in the handlers that take large
 *    bodies. They refuse early by `Content-Length` too, and also stop
 *    reading once the real byte count passes the limit, which covers a
 *    chunked request that declares no length.
 */

/** Multipart boundaries and form fields around the file itself. */
export const BODY_OVERHEAD_BYTES = 64 * 1024;

/** Largest JSON body for a route that takes nothing but settings and text. */
export const JSON_BODY_BYTES = 8 * 1024 * 1024;

/** Largest JSON body that carries an image as a base64 data URL (a 15 MB PNG is about 20 MB). */
export const IMAGE_JSON_BODY_BYTES = 24 * 1024 * 1024;

/** Largest notebook export (.zip) the import route reads. */
export const MAX_NOTEBOOK_ZIP_BYTES = 200 * 1024 * 1024;

/**
 * The most any route may receive. Matches `proxyClientMaxBodySize` in
 * next.config.ts, past which Next.js would truncate the body without a word.
 */
export const BODY_CEILING_BYTES = Math.max(MAX_UPLOAD_BYTES, MAX_NOTEBOOK_ZIP_BYTES) + 1024 * 1024;

/** The body is bigger than the route accepts. */
export class PayloadTooLargeError extends Error {
  readonly status = 413;
  constructor(message: string) {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

type Rule = { pattern: RegExp; max: number; chunked: boolean };

/**
 * Routes that take more than a JSON body of ordinary size. `chunked` marks the
 * ones that stream files and read them with `limitBody`, so they may omit
 * Content-Length; every other route must send it. Each handler still enforces
 * its own exact limit and its own message, these are the outer bounds.
 */
const RULES: readonly Rule[] = [
  { pattern: /^\/api\/notebooks\/[^/]+\/sources$/, max: BODY_CEILING_BYTES, chunked: true },
  { pattern: /^\/api\/notebooks\/import$/, max: BODY_CEILING_BYTES, chunked: true },
  { pattern: /^\/api\/music$/, max: BODY_CEILING_BYTES, chunked: true },
  { pattern: /^\/api\/bookends\/[^/]+\/file$/, max: BODY_CEILING_BYTES, chunked: true },
  { pattern: /^\/api\/backup\/restore$/, max: BODY_CEILING_BYTES, chunked: true },
  { pattern: /^\/api\/watermark$/, max: IMAGE_JSON_BODY_BYTES, chunked: false },
  { pattern: /^\/api\/training\/[^/]+\/(?:assets|raster)$/, max: IMAGE_JSON_BODY_BYTES, chunked: false },
];

const NO_BODY = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * What is wrong with a request's declared size, or null when it is fine.
 * Reads headers only.
 */
export function declaredBodyProblem(
  method: string,
  pathname: string,
  headers: Pick<Headers, "get">,
): { status: number; error: string; code: string } | null {
  if (NO_BODY.has(method.toUpperCase())) return null;
  const rule = RULES.find((r) => r.pattern.test(pathname));
  const max = rule?.max ?? JSON_BODY_BYTES;

  const length = headers.get("content-length");
  if (length !== null) {
    if (!/^\d{1,15}$/.test(length.trim())) {
      return { status: 400, error: "The Content-Length header is not a valid size.", code: "invalid" };
    }
    const declared = Number(length);
    if (declared > max) {
      return { status: 413, error: `That request is ${mb(declared)}, over the ${mb(max)} this endpoint accepts.`, code: "too_large" };
    }
    return null;
  }

  if (/chunked/i.test(headers.get("transfer-encoding") ?? "") && !rule?.chunked) {
    return {
      status: 411,
      error: "Send this request with a Content-Length header. Its size cannot be checked when it is sent in chunks.",
      code: "length_required",
    };
  }
  return null;
}

function declaredLength(req: Request): number | null {
  const header = req.headers.get("content-length");
  if (header === null || !/^\d{1,15}$/.test(header.trim())) return null;
  return Number(header);
}

/**
 * The same request with its body cut off at `max` bytes. Refuses at once when
 * Content-Length already says it is too big; otherwise the body stream fails
 * with a `PayloadTooLargeError` as soon as the bytes that actually arrive pass
 * the limit, whatever the headers claimed. Read the returned request, not `req`.
 */
export function limitBody(req: Request, max: number, tooLarge?: string): Request {
  const message = tooLarge ?? `That request is larger than the ${mb(max)} this endpoint accepts.`;
  const declared = declaredLength(req);
  if (declared !== null && declared > max) throw new PayloadTooLargeError(message);
  if (!req.body) return req;

  let seen = 0;
  const body = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) controller.error(new PayloadTooLargeError(message));
        else controller.enqueue(chunk);
      },
    }),
  );
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
    signal: req.signal,
    duplex: "half",
  } as RequestInit);
}

async function readLimited<T>(
  req: Request,
  max: number,
  tooLarge: string | undefined,
  read: (limited: Request) => Promise<T>,
): Promise<T> {
  const limited = limitBody(req, max, tooLarge);
  try {
    return await read(limited);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw e;
    // The parser may wrap the stream's error; the cause still names it.
    const cause = (e as { cause?: unknown } | null)?.cause;
    if (cause instanceof PayloadTooLargeError) throw cause;
    throw e;
  }
}

/** `req.formData()`, refusing bodies over `max` bytes before they are all in memory. */
export const readLimitedForm = (req: Request, max: number, tooLarge?: string) =>
  readLimited(req, max, tooLarge, (r) => r.formData());

/** `req.text()`, refusing bodies over `max` bytes. */
export const readLimitedText = (req: Request, max: number, tooLarge?: string) =>
  readLimited(req, max, tooLarge, (r) => r.text());

/** `req.json()`, refusing bodies over `max` bytes. A body that is not JSON still throws SyntaxError. */
export const readLimitedJSON = (req: Request, max: number, tooLarge?: string) =>
  readLimited<unknown>(req, max, tooLarge, (r) => r.json());

/** Body size for a JSON object that carries `bytes` of binary data as a base64 data URL. */
export const base64JsonBytes = (bytes: number) => Math.ceil((bytes * 4) / 3) + BODY_OVERHEAD_BYTES;

/**
 * Like `readLimitedJSON`, but a body that is missing or not JSON gives
 * `fallback`, as `req.json().catch(() => fallback)` would. An oversized body
 * still throws, so the error is never swallowed by the fallback.
 */
export async function readJSONOr<T>(req: Request, max: number, fallback: T, tooLarge?: string): Promise<unknown> {
  try {
    return await readLimitedJSON(req, max, tooLarge);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw e;
    return fallback;
  }
}
