import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Flashcards from "@/components/Flashcards";

/** Deepest run of <button> elements open at once in a static markup string. */
function maxButtonDepth(html: string) {
  let depth = 0;
  let max = 0;
  for (const m of html.matchAll(/<(\/?)button\b/g)) {
    depth += m[1] ? -1 : 1;
    max = Math.max(max, depth);
  }
  return max;
}

describe("Flashcards", () => {
  const html = renderToStaticMarkup(
    <Flashcards
      artifactId="t"
      content={{
        title: "Deck",
        cards: [{ front: "What is it? [1]", back: "An answer [1]", hint: "Think" }],
      }}
      citations={[{ n: 1, sourceId: "s", sourceTitle: "Doc", part: 1, snippet: "x" }]}
    />
  );

  it("never nests a button inside another button", () => {
    expect(maxButtonDepth(html)).toBe(1);
  });

  it("flips through a dedicated, labeled control that wraps no content", () => {
    // The answer side carries citation buttons; an empty overlay guarantees
    // they can never end up inside the flip button once the card turns over.
    expect(html).toMatch(/<button[^>]*aria-label="Reveal answer"[^>]*><\/button>/);
    expect(html).toContain("What is it?");
    expect(html).not.toContain("[1]");
  });
});
