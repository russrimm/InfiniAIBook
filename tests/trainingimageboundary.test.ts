import { beforeEach, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({ urls: [] as string[], searches: 0 }));
const selected = "https://learn.microsoft.com/en-us/selected-orchard";
const outside = "https://learn.microsoft.com/en-us/other-orchard";

vi.mock("@/lib/learn", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/learn")>(),
  searchLearn: async () => {
    network.searches++;
    return [{ url: "https://learn.microsoft.com/en-us/other-orchard", title: "Other orchard", content: "" }];
  },
}));
vi.mock("@/lib/safefetch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/safefetch")>(),
  safeFetch: async (url: string) => {
    network.urls.push(url);
    const png = Buffer.alloc(32);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    const body = url.endsWith(".png")
      ? png
      : '<main><h1>Orchard</h1><img src="media/orchard.png" alt="Screenshot showing the orchard harvest"></main>';
    return { res: new Response(body), finalUrl: url };
  },
}));

import { findLearnScreenshot } from "@/lib/learnimages";

beforeEach(() => {
  network.urls = [];
  network.searches = 0;
});

it("does not search the web for training pictures when no selected source is a Learn page", async () => {
  expect(await findLearnScreenshot("orchard", new Set(), new Map(), [])).toBeNull();
  expect(network.urls).toEqual([]);
  expect(network.searches).toBe(0);
});

it("finds training screenshots only inside selected source pages", async () => {
  const picture = await findLearnScreenshot("orchard", new Set(), new Map(), [selected]);
  expect(picture?.page).toBe(selected);
  expect(network.urls).toContain(selected);
  expect(network.urls).not.toContain(outside);
  expect(network.searches).toBe(0);
});
