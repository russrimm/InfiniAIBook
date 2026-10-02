import { describe, expect, it } from "vitest";
import { BlockedHostError, assertPublicUrl, pinnedLookup } from "@/lib/safefetch";

const lookup = (host: string, all: boolean) =>
  new Promise<unknown>((resolve, reject) =>
    pinnedLookup(host, { all }, (err, address) => (err ? reject(err) : resolve(address)))
  );

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
