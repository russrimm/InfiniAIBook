import { JSONReplyError, readJSONReply } from "./jsonreply";

export class TrainingRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | undefined,
    cause: unknown,
    public readonly code?: string,
  ) {
    super(message, { cause });
    this.name = "TrainingRequestError";
  }
}

/** Failures that mean every further picture would fail the same way. */
const STOP_CODES = new Set(["config", "auth", "no_config", "budget", "invalid_sources"]);

/**
 * How one failed picture request should affect the rest of the run:
 * "none" the request worked but found nothing (404), so it is just a visual
 * without a picture; "transient" a dropped connection, rate limit or server
 * hiccup that may well pass, so skip this one and carry on; "stop" a
 * credential, configuration or budget problem that will repeat for every
 * picture, so stop instead of failing them all.
 */
export function pictureFailure(e: unknown): "none" | "transient" | "stop" {
  if (!(e instanceof TrainingRequestError)) return "stop";
  if (e.status === 404) return "none";
  if (e.code && STOP_CODES.has(e.code)) return "stop";
  if (e.status === 400 || e.status === 401 || e.status === 403) return "stop";
  return "transient";
}

/** Keep transport failures distinguishable from server replies during render preparation. */
export async function trainingRequest<T extends { error?: string }>(
  url: string,
  step: string,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method ?? "GET";
  let response: Response | undefined;
  try {
    response = await fetch(url, init);
    return await readJSONReply<T>(response, `${step} failed.`);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "Unknown error";
    const status = response ? `HTTP ${response.status}` : "no HTTP response";
    console.error("[training] request failed", { step, method, url, status }, cause);
    throw new TrainingRequestError(
      `${step} failed (${method} ${url}; ${status}): ${detail}${
        !response
          ? ". Check your connection and the browser Console. If render submission was interrupted, check the video's progress before trying again."
          : ""
      }`,
      cause instanceof JSONReplyError ? cause.status : response?.status,
      cause,
      cause instanceof JSONReplyError ? cause.code : undefined,
    );
  }
}
