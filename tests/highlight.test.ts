import { describe, expect, it } from "vitest";
import { findPassage } from "@/lib/highlight";

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
