import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Agent, fetch as undiciFetch } from "undici";
import { markAfterResponse } from "./connectionerror";
import type { RemoteFailure } from "./videoclip";

/**
 * HTTP plumbing the video providers share: turning an error reply into an
 * error the retry layer understands, and moving large bodies to disk without
 * holding them in memory.
 */

/**
 * fetch with timeouts long enough for video. Node's default waits five minutes
 * for response headers, which a provider that answers only when the clip is
 * ready can exceed; a clip that finishes in six minutes would fail as dropped.
 */
const VIDEO_TIMEOUT_MS = (Number(process.env.VIDEO_CLIP_TIMEOUT_MIN) > 0 ? Number(process.env.VIDEO_CLIP_TIMEOUT_MIN) : 15) * 60_000;
let videoAgent: Agent | null = null;
export const videoFetch: typeof fetch = (input, init) => {
  videoAgent ??= new Agent({ headersTimeout: VIDEO_TIMEOUT_MS, bodyTimeout: VIDEO_TIMEOUT_MS });
  return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: videoAgent,
  }) as unknown as Promise<Response>;
};

const MODERATION =
  /moderation|content[_ -]?(policy|filter|safety)|safety|blocked|responsible[_ -]?ai|policy[_ -]?violation|prohibited|not allowed|inappropriate|likeness|copyright/i;

export const looksModerated = (...parts: (string | undefined)[]): boolean =>
  MODERATION.test(parts.filter(Boolean).join(" "));

/** Read a body as text without trusting its size. */
async function textCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    /* a body cut short still tells us what it can */
  } finally {
    void reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8").slice(0, maxBytes);
}

/** Pull a code and message out of the error shapes the providers use. */
export function parseFailure(body: string): RemoteFailure | undefined {
  try {
    const j = JSON.parse(body) as { error?: unknown; message?: unknown; code?: unknown };
    const e = (typeof j.error === "object" && j.error ? j.error : j) as {
      code?: unknown;
      message?: unknown;
      status?: unknown;
      type?: unknown;
    };
    const message = typeof e.message === "string" ? e.message : typeof j.error === "string" ? j.error : undefined;
    if (!message) return undefined;
    const code =
      typeof e.code === "string" ? e.code : typeof e.status === "string" ? e.status : typeof e.type === "string" ? e.type : undefined;
    return { code, message, moderation: looksModerated(code, message) };
  } catch {
    return undefined;
  }
}

/** The headers the retry layer reads, flattened, with `retry-after-ms` folded into `retry-after`. */
function flatHeaders(res: Response): Record<string, string> {
  const out = Object.fromEntries(res.headers.entries());
  const ms = Number(out["retry-after-ms"]);
  if (!out["retry-after"] && Number.isFinite(ms) && ms >= 0) out["retry-after"] = String(ms / 1000);
  return out;
}

export type HttpStatusError = Error & {
  status: number;
  headers: Record<string, string>;
  failure?: RemoteFailure;
};

/**
 * An error for a non-2xx reply. It carries `status` and `headers` so
 * retryTransient can honor Retry-After, and the provider's own message so a
 * moderation refusal reads as one.
 */
export async function httpError(res: Response, what: string): Promise<HttpStatusError> {
  const body = await textCapped(res, 8_000);
  const failure = parseFailure(body);
  const detail = failure?.message ?? body.replace(/\s+/g, " ").trim().slice(0, 300);
  return Object.assign(new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : "."}`), {
    status: res.status,
    headers: flatHeaders(res),
    failure,
  });
}

/** Parse a JSON reply, treating a body that cuts off as the connection dropping after the server answered. */
export async function readJson<T>(res: Response, what: string, maxBytes = 10 * 1024 * 1024): Promise<T> {
  let text: string;
  try {
    text = await textCappedStrict(res, maxBytes);
  } catch (e) {
    throw markAfterResponse(
      new Error(`The connection dropped while ${what} was being sent back (${e instanceof Error ? e.message : String(e)}).`, {
        cause: e,
      }),
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${what} was not valid JSON.`);
  }
}

async function textCappedStrict(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      void reader.cancel().catch(() => {});
      throw new Error(`the reply is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** An MP4 starts with a box whose type, at bytes 4 to 8, is "ftyp". */
export const looksLikeMp4 = (head: Uint8Array): boolean =>
  head.length >= 12 && Buffer.from(head.subarray(4, 8)).toString("latin1") === "ftyp";

export class DownloadTooLargeError extends Error {}

/**
 * Stream a response body to `dest`, giving up past `maxBytes`. Written to a
 * sibling `.part` file and renamed once complete, so a cancelled or dropped
 * download never leaves a half clip that looks finished.
 */
export async function streamToFile(
  res: Response,
  dest: string,
  maxBytes: number,
  opts: { signal?: AbortSignal; kind?: "mp4" | "any" } = {},
): Promise<number> {
  if (!res.body) throw new Error("The video download had no content.");
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    void res.body.cancel().catch(() => {});
    throw new DownloadTooLargeError(tooLarge(maxBytes));
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let bytes = 0;
  let head: Buffer = Buffer.alloc(0);
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (head.length < 12) head = Buffer.concat([head, chunk]).subarray(0, 12);
      if (bytes > maxBytes) cb(new DownloadTooLargeError(tooLarge(maxBytes)));
      else cb(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      fs.createWriteStream(part),
      { signal: opts.signal },
    );
  } catch (e) {
    fs.rmSync(part, { force: true });
    if (e instanceof DownloadTooLargeError || opts.signal?.aborted) throw e;
    throw markAfterResponse(
      new Error(`The connection dropped while the clip was downloading (${e instanceof Error ? e.message : String(e)}).`, { cause: e }),
    );
  }

  if (bytes === 0 || ((opts.kind ?? "mp4") === "mp4" && !looksLikeMp4(head))) {
    fs.rmSync(part, { force: true });
    throw new Error("The provider returned something that is not an MP4 video.");
  }
  fs.renameSync(part, dest);
  return bytes;
}

/** Write bytes already in memory with the same checks and atomic rename. */
export function writeVideoFile(dest: string, bytes: Uint8Array, maxBytes: number, kind: "mp4" | "any" = "mp4"): number {
  if (bytes.byteLength > maxBytes) throw new DownloadTooLargeError(tooLarge(maxBytes));
  if (bytes.byteLength === 0 || (kind === "mp4" && !looksLikeMp4(bytes))) {
    throw new Error("The provider returned something that is not an MP4 video.");
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  fs.writeFileSync(part, bytes);
  fs.renameSync(part, dest);
  return bytes.byteLength;
}

const tooLarge = (maxBytes: number) =>
  `The clip is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit (VIDEO_CLIP_MAX_MB), so it was not saved.`;

/** An id from a provider, used in a URL path. Anything unusual is refused rather than escaped. */
export function safeRemoteId(id: unknown): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) {
    throw new Error("The video provider returned an unusable job id.");
  }
  return id;
}
