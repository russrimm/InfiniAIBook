import { describe, expect, it } from "vitest";
import {
  filterNotebooks,
  isNotebookSort,
  sortNotebooks,
  wasUpdated,
  type ListedNotebook,
} from "@/lib/notebooklist";

const nb = (id: string, title: string, createdAt: number, extra: Partial<ListedNotebook> = {}): ListedNotebook => ({
  id,
  title,
  emoji: "📓",
  createdAt,
  ...extra,
});

const books = [
  nb("a", "Week 10 reading", 100, { sourceCount: 2, lastActivity: 900 }),
  nb("b", "week 2 reading", 300, { sourceCount: 9, lastActivity: 300 }),
  nb("c", "Budget notes", 200, { sourceCount: 2, lastActivity: 5000 }),
];

describe("filterNotebooks", () => {
  it("matches every word typed, in any order, ignoring case", () => {
    expect(filterNotebooks(books, "READING week").map((n) => n.id)).toEqual(["a", "b"]);
    expect(filterNotebooks(books, "budget").map((n) => n.id)).toEqual(["c"]);
    expect(filterNotebooks(books, "nothing like this")).toEqual([]);
  });

  it("returns the list untouched for a blank query", () => {
    expect(filterNotebooks(books, "   ")).toBe(books);
  });
});

describe("sortNotebooks", () => {
  const ids = (sort: Parameters<typeof sortNotebooks>[1]) => sortNotebooks(books, sort).map((n) => n.id);

  it("orders by activity, creation date, name and source count", () => {
    expect(ids("recent")).toEqual(["c", "a", "b"]);
    expect(ids("newest")).toEqual(["b", "c", "a"]);
    expect(ids("oldest")).toEqual(["a", "c", "b"]);
    expect(ids("name")).toEqual(["c", "b", "a"]);
    expect(ids("sources")).toEqual(["b", "c", "a"]);
  });

  it("reads numbers in names as numbers and does not change the input", () => {
    const before = books.map((n) => n.id);
    expect(ids("name").indexOf("b")).toBeLessThan(ids("name").indexOf("a"));
    expect(books.map((n) => n.id)).toEqual(before);
  });

  it("treats a notebook without activity data as last active when it was created", () => {
    const list = [nb("x", "Older", 100), nb("y", "Newer", 200)];
    expect(sortNotebooks(list, "recent").map((n) => n.id)).toEqual(["y", "x"]);
  });
});

describe("notebook list helpers", () => {
  it("only says a notebook was updated when something happened after it was made", () => {
    expect(wasUpdated(nb("a", "A", 1_000, { lastActivity: 30_000 }))).toBe(false);
    expect(wasUpdated(nb("a", "A", 1_000, { lastActivity: 5_000_000 }))).toBe(true);
    expect(wasUpdated(nb("a", "A", 1_000))).toBe(false);
  });

  it("recognizes only known sort keys", () => {
    expect(isNotebookSort("name")).toBe(true);
    expect(isNotebookSort("random")).toBe(false);
    expect(isNotebookSort(null)).toBe(false);
  });
});
