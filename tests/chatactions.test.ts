import { describe, expect, it } from "vitest";
import { chatToMarkdown, citationLines, exportFilename, messageToMarkdown } from "@/lib/chatmarkdown";
import { parseSuggestions, suggestionPrompt } from "@/lib/chatsuggest";
import { planTurn, TurnError, HISTORY_TURNS } from "@/lib/chatturn";
import type { Citation } from "@/lib/types";

const cite = (n: number, extra: Partial<Citation> = {}): Citation => ({
  n,
  sourceId: `s${n}`,
  sourceTitle: `Source ${n}`,
  part: n,
  snippet: `Snippet ${n}`,
  ...extra,
});

describe("citationLines", () => {
  it("lists each marker once, in order, with source, location and excerpt", () => {
    expect(citationLines([cite(2), cite(1), cite(2, { sourceTitle: "Dup" })])).toEqual([
      "[1] Source 1 (part 1): “Snippet 1…”",
      "[2] Source 2 (part 2): “Snippet 2…”",
    ]);
  });

  it("names the page for a live excerpt and clips a long snippet", () => {
    const [line] = citationLines([cite(1, { url: "https://learn.microsoft.com/a", snippet: "x".repeat(300) })]);
    expect(line).toContain("(live excerpt, https://learn.microsoft.com/a)");
    expect(line.length).toBeLessThan(260);
  });
});

describe("messageToMarkdown", () => {
  it("copies a user message as typed", () => {
    expect(messageToMarkdown({ role: "user", content: "  Why?\nBecause. " })).toBe("Why?\nBecause.");
  });

  it("keeps an answer's markers and appends a readable Sources list", () => {
    const text = messageToMarkdown({ role: "assistant", content: "Beds cost $640 [1].", citations: [cite(1)] });
    expect(text).toBe("Beds cost $640 [1].\n\n**Sources**\n- [1] Source 1 (part 1): “Snippet 1…”");
  });

  it("adds nothing to an uncited answer", () => {
    expect(messageToMarkdown({ role: "assistant", content: "Plain." })).toBe("Plain.");
  });
});

describe("chatToMarkdown", () => {
  const doc = chatToMarkdown(
    { title: "Garden  pilot" },
    [
      { role: "user", content: "How many beds?\n# not a heading" },
      { role: "assistant", content: "24 beds [1].", citations: [cite(1)] },
      { role: "user", content: "Anything else?" },
      { role: "assistant", content: "I do not know." },
    ],
    { notebookTitle: "Garden", exportedAt: new Date("2026-11-14T12:00:00Z") }
  );

  it("starts with the title and where and when it came from", () => {
    expect(doc.startsWith("# Garden pilot\n\n_Notebook: Garden · Exported 2026-11-14 · 4 messages_\n")).toBe(true);
  });

  it("quotes the user's words so their headings cannot restructure the document", () => {
    expect(doc).toContain("## You\n\n> How many beds?\n> # not a heading");
  });

  it("puts each answer's sources beneath it and flags an uncited one", () => {
    expect(doc).toContain("## Assistant\n\n24 beds [1].\n\n**Sources**\n- [1] Source 1 (part 1)");
    expect(doc).toContain("I do not know.\n\n_Not cited.");
  });
});

describe("exportFilename", () => {
  it.each([
    ["Garden pilot: Q&A!", "garden-pilot-q-a.md"],
    ["   ", "chat.md"],
    ["Café déjà vu", "cafe-deja-vu.md"],
  ])("turns %j into %j", (title, file) => {
    expect(exportFilename(title)).toBe(file);
  });
});

describe("planTurn", () => {
  const rows = [
    { id: "u1", role: "user" as const, content: "first" },
    { id: "a1", role: "assistant" as const, content: "one" },
    { id: "u2", role: "user" as const, content: "second" },
    { id: "a2", role: "assistant" as const, content: "two" },
  ];

  it("appends a plain question after the recent turns", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 ? ("assistant" as const) : ("user" as const),
      content: `${i}`,
    }));
    const plan = planTurn(many, "next");
    expect(plan.question).toBe("next");
    expect(plan.history).toHaveLength(HISTORY_TURNS);
    expect(plan.history.at(-1)?.id).toBe("m19");
    expect(plan.replaceId).toBeUndefined();
  });

  it("regenerates the last answer from its own question, without it in the history", () => {
    const plan = planTurn(rows, "ignored", "regenerate", "a2");
    expect(plan).toMatchObject({ question: "second", replaceId: "a2", mode: "regenerate" });
    expect(plan.history.map((r) => r.id)).toEqual(["u1", "a1"]);
  });

  it.each([
    ["an earlier answer", "a1"],
    ["a user message", "u2"],
  ])("refuses to regenerate %s", (_n, id) => {
    expect(() => planTurn(rows, "x", "regenerate", id)).toThrow(/latest answer/);
  });

  it("edits a user message, keeping only what came before it", () => {
    const plan = planTurn(rows, "revised", "edit", "u1");
    expect(plan).toMatchObject({ question: "revised", truncateId: "u1", mode: "edit" });
    expect(plan.history).toEqual([]);
    expect(planTurn(rows, "revised", "edit", "u2").history.map((r) => r.id)).toEqual(["u1", "a1"]);
  });

  it("refuses to edit an answer, an unknown message or an unknown action", () => {
    const status = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof TurnError ? e.status : -1;
      }
      return 0;
    };
    expect(status(() => planTurn(rows, "x", "edit", "a1"))).toBe(400);
    expect(status(() => planTurn(rows, "x", "edit", "nope"))).toBe(404);
    expect(status(() => planTurn(rows, "x", "edit"))).toBe(400);
    expect(status(() => planTurn(rows, "x", "delete", "u1"))).toBe(400);
    expect(status(() => planTurn([], "x", "regenerate", "a1"))).toBe(404);
  });
});

describe("parseSuggestions", () => {
  it("reads the JSON object the model was asked for", () => {
    const raw = '{"suggestions":["What did the pilot cost?","Who ran the workshops?","How many beds were built?","Fourth one?"]}';
    expect(parseSuggestions(raw)).toEqual([
      "What did the pilot cost?",
      "Who ran the workshops?",
      "How many beds were built?",
    ]);
  });

  it("copes with a fenced reply, a bare array and surrounding prose", () => {
    expect(parseSuggestions('```json\n["What is the budget?"]\n```')).toEqual(["What is the budget?"]);
    expect(parseSuggestions('Sure! {"suggestions":["Where are the beds?"]} Hope that helps.')).toEqual([
      "Where are the beds?",
    ]);
  });

  it("falls back to a bulleted or numbered list", () => {
    expect(parseSuggestions("Here you go:\n1. What is the budget?\n- Who volunteers? \n* “Why drip kits?”")).toEqual([
      "What is the budget?",
      "Who volunteers?",
      "Why drip kits?",
    ]);
  });

  it("drops repeats, the question just asked, non-questions, citation markers and oversized lines", () => {
    const raw = JSON.stringify({
      suggestions: [
        "How many beds were built?",
        "how many beds were BUILT?",
        "Tell me about beds.",
        "Short?",
        "x".repeat(200) + "?",
        "What did it cost [1]?",
        42,
      ],
    });
    expect(parseSuggestions(raw, "How many beds were built")).toEqual(["What did it cost?"]);
  });

  it("returns nothing for an empty reply", () => {
    expect(parseSuggestions("")).toEqual([]);
  });
});

describe("suggestionPrompt", () => {
  it("shows the model only a bounded slice: the question, a shortened answer and a few excerpts", () => {
    const cites = Array.from({ length: 8 }, (_, i) => cite(i + 1, { snippet: "s".repeat(1000) }));
    const [system, user] = suggestionPrompt("Q?", "a".repeat(5000), cites);
    expect(system.content).toContain("answerable from the source excerpts");
    expect(user.content.length).toBeLessThan(3500);
    expect(user.content).toContain("[4] Source 4");
    expect(user.content).not.toContain("[5] Source 5");
  });
});
