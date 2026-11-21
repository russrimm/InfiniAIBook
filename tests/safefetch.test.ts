import { describe, expect, it } from "vitest";
import {
  BlockedHostError,
  DownloadTimeoutError,
  ResponseTooLargeError,
  assertPublicUrl,
  pinnedLookup,
  readCapped,
} from "@/lib/safefetch";

const lookup = (host: string, all: boolean) =>
  new Promise<unknown>((resolve, reject) =>
    pinnedLookup(host, { all }, (err, address) => (err ? reject(err) : resolve(address)))
  );

/** A body that sends `bytes` now and then, one `every` ms, and never ends when `finish` is false. */
function slowBody(bytes: number, every: number, finish: boolean): Response {
  let sent = 0;
  let timer: ReturnType<typeof setInterval>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => {
        if (sent < bytes) {
          controller.enqueue(new Uint8Array([97]));
          sent++;
        } else if (finish) {
          clearInterval(timer);
          controller.close();
        }
      }, every);
    },
    cancel() {
      clearInterval(timer);
    },
  });
  return new Response(stream);
}

describe("readCapped", () => {
  it("reads a body that arrives in time", async () => {
    const body = await readCapped(slowBody(5, 5, true), 1024, 2000);
    expect(body.toString()).toBe("aaaaa");
  });

  it("stops a body that trickles in under the size cap but past the deadline", async () => {
    const started = Date.now();
    await expect(readCapped(slowBody(1000, 10, false), 1024 * 1024, 150)).rejects.toBeInstanceOf(DownloadTimeoutError);
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("stops a body that goes quiet and never ends, naming the time limit", async () => {
    await expect(readCapped(slowBody(2, 5, false), 1024, 100)).rejects.toThrow(/took longer than \d+ seconds? to download/);
  });

  it("still enforces the size cap first when the body is fast", async () => {
    await expect(readCapped(slowBody(50, 1, true), 10, 2000)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});

describe("pinnedLookup", () => {
  it("refuses names that resolve to loopback at connect time", async () => {
    await expect(lookup("localhost", false)).rejects.toBeInstanceOf(BlockedHostError);
    await expect(lookup("localhost", true)).rejects.toBeInstanceOf(BlockedHostError);
  });
});

describe("assertPublicUrl", () => {
  it("refuses private literals and non-http schemes", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.1/",
      "file:///etc/passwd",
      "http://localhost/",
    ]) {
      await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedHostError);
    }
  });
});
