import { describe, expect, it } from "vitest";
import { citationsUsed, historyForPrompt } from "@/lib/citations";

const cites = [
  { n: 1, sourceId: "a" },
  { n: 2, sourceId: "b" },
  { n: 3, sourceId: "c" },
];

describe("citationsUsed", () => {
  it("keeps only markers the answer wrote", () => {
    expect(citationsUsed("Rain fell [1] and then stopped [3].", cites)).toEqual([
      cites[0],
      cites[2],
    ]);
  });

  it("does not attach retrieved passages when nothing was cited", () => {
    expect(citationsUsed("The sources do not cover this.", cites)).toEqual([]);
  });
});

describe("historyForPrompt", () => {
  it("labels earlier answers as not evidence and strips their markers", () => {
    const [user, assistant] = historyForPrompt([
      { role: "user" as const, content: "What happened?" },
      { role: "assistant" as const, content: "It rained [1]." },
    ]);
    expect(user.content).toBe("What happened?");
    expect(assistant.content).toContain("not a source");
    expect(assistant.content).not.toContain("[1]");
    expect(assistant.content).toContain("It rained");
  });
});
