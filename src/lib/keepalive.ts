import { fail } from "./http";

/**
 * Proxies in front of the app drop a response that stays silent too long:
 * Azure Container Apps' ingress answers a plain-text "stream timeout" after
 * 240 idle seconds. Work that finishes within `graceMs` is returned as is,
 * status and all. Longer work commits to a 200 and streams spaces — valid
 * leading JSON whitespace — until the real body is ready, so a failure then
 * arrives as `{ error }` in the body rather than as a status code.
 */
export async function keepAliveJSON(
  work: () => Promise<Response>,
  { graceMs = 5_000, intervalMs = 15_000 }: { graceMs?: number; intervalMs?: number } = {}
): Promise<Response> {
  const pending = work().catch((e) => fail(e));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const early = await Promise.race([
    pending,
    new Promise<null>((r) => {
      timer = setTimeout(() => r(null), graceMs);
    }),
  ]);
  clearTimeout(timer);
  if (early) return early;

  const encoder = new TextEncoder();
  let beat: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (s: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          open = false; // the client went away; the work still finishes and saves
        }
      };
      write(" ");
      beat = setInterval(() => write(" "), intervalMs);
      try {
        const res = await pending;
        const text = await res.text();
        write(res.ok ? text : asError(text, res.status));
      } catch (e) {
        write(JSON.stringify({ error: e instanceof Error ? e.message : "Unexpected error" }));
      } finally {
        clearInterval(beat);
        if (open) {
          try {
            controller.close();
          } catch {
            /* already cancelled */
          }
        }
      }
    },
    cancel() {
      clearInterval(beat);
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/** A failed body that is sure to carry `error`, since the 200 is already sent. */
function asError(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return JSON.stringify({ ...parsed, status });
    }
  } catch {
    /* not JSON */
  }
  return JSON.stringify({ error: text.trim() || `Request failed (${status}).`, status });
}
