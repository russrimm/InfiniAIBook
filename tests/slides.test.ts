import { describe, expect, it } from "vitest";
import { normalizeSlides, slidesToMarkdown } from "@/lib/slides";
import type { Citation } from "@/lib/types";

const citations: Citation[] = [
  { n: 1, sourceId: "a", sourceTitle: "Source Alpha", part: 1, snippet: "Alpha" },
  { n: 2, sourceId: "b", sourceTitle: "Source Beta", part: 1, snippet: "Beta" },
  { n: 3, sourceId: "a", sourceTitle: "Source Alpha", part: 2, snippet: "More alpha" },
];

describe("normalizeSlides", () => {
  it("adds title and agenda slides, caps bullets, strips slide citations, and appends sources", () => {
    const deck = normalizeSlides(
      {
        title: "Research update [1]",
        subtitle: "What matters [2]",
        slides: [
          {
            layout: "bullets",
            title: "Market signals [1]",
            bullets: [
              "Demand grew in every segment [1]",
              "Customers asked for clearer controls [2]",
              "Teams reduced duplicated work [3]",
              "Budgets moved toward platform bets [1]",
              "Leaders tracked governance from day one [2]",
              "Support improved after onboarding [3]",
              "This extra bullet should be dropped [1]",
            ],
            notes: "Demand and governance are discussed in the excerpts [1][2].",
          },
          {
            layout: "section",
            title: "Operating model [2]",
            notes: "The source frames this as an operating-model change [2].",
          },
          {
            layout: "closing",
            title: "Key takeaways",
            bullets: ["Start narrow [1]", "Measure outcomes [2]", "Keep owners visible [3]"],
            notes: "The closing ties the three source-backed themes together [1][2][3].",
          },
        ],
      },
      "ocean",
      citations
    )!;

    expect(deck.theme).toBe("ocean");
    expect(deck.title).toBe("Research update");
    expect(deck.slides[0]).toMatchObject({ layout: "title", title: "Research update" });
    expect(deck.slides[1].layout).toBe("agenda");
    expect(deck.slides[2].title).toBe("Market signals");
    expect(deck.slides[2].bullets).toHaveLength(6);
    expect(deck.slides[2].bullets?.join(" ")).not.toContain("[1]");
    expect(deck.slides[2].notes).toContain("[1][2]");
    expect(deck.slides.at(-1)).toMatchObject({
      layout: "sources",
      title: "Sources",
      bullets: ["Source Alpha", "Source Beta"],
    });
  });

  it("returns null when fewer than three usable model slides survive", () => {
    expect(
      normalizeSlides({
        title: "Too short",
        slides: [
          { layout: "title", title: "One" },
          { layout: "bullets", title: "Two", bullets: [] },
          { layout: "bullets", title: "   ", bullets: [] },
        ],
      })
    ).toBeNull();
  });
});

describe("slidesToMarkdown", () => {
  it("exports deck content and speaker notes", () => {
    const deck = normalizeSlides(
      {
        title: "Research update",
        slides: [
          { layout: "title", title: "Research update", subtitle: "A briefing" },
          { layout: "agenda", title: "Agenda", bullets: ["Context", "Decision"] },
          {
            layout: "closing",
            title: "Decision",
            bullets: ["Approve the pilot"],
            notes: "The recommendation follows the cited trial [2].",
          },
        ],
      },
      "midnight",
      citations
    )!;

    expect(slidesToMarkdown(deck)).toContain("# Research update");
    expect(slidesToMarkdown(deck)).toContain("## Agenda");
    expect(slidesToMarkdown(deck)).toContain("- Approve the pilot");
    expect(slidesToMarkdown(deck)).toContain("> Speaker notes: The recommendation follows the cited trial [2].");
  });
});
