import { describe, expect, it } from "vitest";
import { chunkText, feedToText } from "@/lib/ingest";
import { diffSummary } from "@/lib/refresh";
import { safeEqual } from "@/lib/auth";

describe("chunkText", () => {
  it("keeps short text as a single chunk", () => {
    expect(chunkText("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits long text into several chunks", () => {
    const para = "Sentence about something interesting. ".repeat(20).trim();
    const text = Array.from({ length: 12 }, () => para).join("\n\n");
    expect(chunkText(text, 1400, 200).length).toBeGreaterThan(1);
  });

  it("hard-splits a paragraph longer than the chunk size", () => {
    const chunks = chunkText("x".repeat(3000), 1400, 200);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(1400);
  });
});

describe("feedToText", () => {
  it("flattens RSS items", () => {
    const xml = `<rss><channel><title>Feed</title>
      <item><title>First</title><description>Body one</description></item>
      <item><title>Second</title><description>Body two</description></item>
    </channel></rss>`;
    const out = feedToText(xml);
    expect(out?.title).toBe("Feed");
    expect(out?.text).toContain("First");
    expect(out?.text).toContain("Body two");
  });

  it("returns null for a document with no entries", () => {
    expect(feedToText("<html><body>nothing</body></html>")).toBeNull();
  });
});

describe("diffSummary", () => {
  it("treats reflowed text as immaterial", () => {
    const a = "one two three four five six seven eight nine ten\neleven twelve";
    const b = "one two three four five\nsix seven eight nine ten eleven twelve";
    expect(diffSummary(a, b).material).toBe(false);
  });

  it("flags a substantial rewrite as material", () => {
    const a = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const b = Array.from({ length: 200 }, (_, i) => `other${i}`).join(" ");
    expect(diffSummary(a, b).material).toBe(true);
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
