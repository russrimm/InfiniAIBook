import { describe, expect, it } from "vitest";
import { findMatches, findPassage, MAX_FIND_MATCHES } from "@/lib/highlight";

const text =
  "Intro paragraph.\n\nPhotosynthesis converts light energy into chemical energy.\nIt happens in chloroplasts,   mostly in leaves.\n\nOutro.";

describe("findPassage", () => {
  it("finds a passage despite different whitespace", () => {
    const r = findPassage(text, "Photosynthesis converts light energy into chemical energy. It happens in chloroplasts, mostly in leaves.");
    expect(r).not.toBeNull();
    const [s, e] = r!;
    expect(text.slice(s)).toMatch(/^Photosynthesis/);
    expect(text.slice(s, e)).toContain("chloroplasts");
  });

  it("tolerates a snippet cut mid-word", () => {
    const r = findPassage(text, "It happens in chloropl");
    expect(r && text.slice(r[0])).toMatch(/^It happens/);
  });

  it("returns null when the passage is not there", () => {
    expect(findPassage(text, "Something else entirely here")).toBeNull();
    expect(findPassage("", "x")).toBeNull();
    expect(findPassage(text, "   ")).toBeNull();
  });

  it("escapes regex characters", () => {
    expect(findPassage("cost (USD) is $5 [approx].", "(USD) is $5 [approx]. x")).toEqual([5, 26]);
  });
});

describe("findMatches", () => {
  it("finds every occurrence regardless of case, with offsets into the original text", () => {
    const { ranges, capped } = findMatches("Energy in, energy out. ENERGY.", "energy");
    expect(capped).toBe(false);
    expect(ranges).toEqual([[0, 6], [11, 17], [23, 29]]);
  });

  it("treats the query literally, not as a pattern", () => {
    expect(findMatches("a.b a+b axb", "a.b").ranges).toEqual([[0, 3]]);
    expect(findMatches("(x) (y)", "(x)").ranges).toEqual([[0, 3]]);
  });

  it("matches nothing for a blank query or empty text", () => {
    expect(findMatches("abc", "   ").ranges).toEqual([]);
    expect(findMatches("", "abc").ranges).toEqual([]);
  });

  it("caps the number of matches", () => {
    const { ranges, capped } = findMatches("a".repeat(MAX_FIND_MATCHES + 50), "a");
    expect(ranges).toHaveLength(MAX_FIND_MATCHES);
    expect(capped).toBe(true);
  });
});
