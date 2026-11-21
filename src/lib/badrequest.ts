import { JSON_BODY_BYTES, PayloadTooLargeError, readLimitedJSON } from "./bodylimits";

/** The caller sent something unusable; routes answer these with 400, not 500. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/**
 * Reads a JSON object from the request body. A missing, empty, malformed or
 * non-object body is the caller's mistake, so it throws a BadRequestError
 * (which `fail` turns into a 400) instead of the SyntaxError a bare
 * `req.json()` would surface as a 500. A body over `maxBytes` throws a
 * PayloadTooLargeError (413) before it is all in memory.
 */
export async function readBody<T = Record<string, unknown>>(
  req: Request,
  maxBytes = JSON_BODY_BYTES,
): Promise<T> {
  let body: unknown;
  try {
    body = await readLimitedJSON(req, maxBytes);
  } catch (e) {
    if (e instanceof PayloadTooLargeError) throw e;
    throw new BadRequestError("Send a JSON request body.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("The request body must be a JSON object.");
  }
  return body as T;
}
