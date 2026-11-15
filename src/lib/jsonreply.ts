export class JSONReplyError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "JSONReplyError";
  }
}

/**
 * Read a JSON reply defensively. A proxy timeout or crash page is plain text,
 * and `res.json()` would surface it as "Unexpected token…" instead of a
 * message a person can act on.
 */
export async function readJSONReply<T extends { error?: string; status?: number }>(
  res: Response,
  fallback = "The request failed.",
  onStatus?: (status: string) => void,
): Promise<T> {
  if (res.headers.get("content-type")?.split(";")[0].trim() === "application/x-ndjson") {
    return readGenerationReply<T>(res, fallback, onStatus);
  }
  const text = await res.text();
  let json: T;
  try {
    json = JSON.parse(text) as T;
  } catch {
    if (res.status === 408 || res.status === 504 || /time(d)?\s*out/i.test(text)) {
      throw new Error(
        "The server took too long to respond. The work may still finish — check the library in a few minutes before trying again."
      );
    }
    const detail = text.trim().slice(0, 200);
    throw new Error(detail ? `${fallback} (${res.status}: ${detail})` : `${fallback} (${res.status})`);
  }
  if (!res.ok || (json && typeof json.error === "string")) {
    throw new JSONReplyError(
      json?.error || fallback,
      typeof json?.status === "number" && json.status >= 400 && json.status <= 599
        ? json.status
        : res.status,
    );
  }
  return json;
}

async function readGenerationReply<T extends { error?: string; status?: number }>(
  res: Response,
  fallback: string,
  onStatus?: (status: string) => void,
): Promise<T> {
  if (!res.ok || !res.body) {
    throw new JSONReplyError(fallback, res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;
  let finished = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event: unknown = JSON.parse(line);
    if (!event || typeof event !== "object" || !("event" in event) || finished) {
      throw new Error("Invalid generation status response.");
    }
    if (event.event === "heartbeat") return;
    if (event.event === "status" && "status" in event && typeof event.status === "string") {
      onStatus?.(event.status);
      return;
    }
    if (
      event.event === "result" &&
      "status" in event && typeof event.status === "number" &&
      Number.isInteger(event.status) && event.status >= 200 && event.status <= 599 &&
      "body" in event
    ) {
      const body = event.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Invalid generation result.");
      }
      if (event.status >= 400 || ("error" in body && typeof body.error === "string")) {
        throw new JSONReplyError(
          "error" in body && typeof body.error === "string" ? body.error : fallback,
          event.status,
        );
      }
      result = body as T;
      finished = true;
      return;
    }
    throw new Error("Invalid generation status response.");
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (done) {
        consume(buffer);
        break;
      }
    }
    if (!finished || !result) {
      throw new Error(
        "The generation connection ended before a result arrived. The work may still finish - check the library before trying again.",
      );
    }
    return result;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
