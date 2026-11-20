import { describe, expect, it } from "vitest";
import { filterCommands, isPaletteShortcut, type Command } from "@/lib/commands";

const cmd = (id: string, label: string, over: Partial<Command> = {}): Command => ({ id, group: "Actions", label, run: () => {}, ...over });

describe("isPaletteShortcut", () => {
  it("is Ctrl+K or Cmd+K, in either case, and nothing else", () => {
    expect(isPaletteShortcut({ key: "k", ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "K", metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k" })).toBe(false);
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, altKey: true })).toBe(false);
    expect(isPaletteShortcut({ key: "j", ctrlKey: true })).toBe(false);
    expect(isPaletteShortcut({ key: "k", ctrlKey: true, isComposing: true })).toBe(false);
  });
});

describe("filterCommands", () => {
  const all = [
    cmd("a", "Add sources", { detail: "Upload files", keywords: "import" }),
    cmd("b", "Go to Studio"),
    cmd("c", "Quiz", { group: "Studio", detail: "Test yourself", keywords: "generate" }),
    cmd("d", "Soil quiz notes", { group: "Sources" }),
    cmd("e", "Export this notebook", { keywords: "download" }),
  ];
  const ids = (q: string) => filterCommands(all, q).map((c) => c.id);

  it("returns everything for a blank query, in the given order", () => {
    expect(ids("")).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids("   ")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("needs every word, and searches the label, detail, keywords and group", () => {
    expect(ids("upload")).toEqual(["a"]);
    expect(ids("download notebook")).toEqual(["e"]);
    expect(ids("sources add")).toEqual(["a"]);
    expect(ids("studio quiz")).toEqual(["c"]);
    expect(ids("nothing like this")).toEqual([]);
  });

  it("ranks a label that starts with the query ahead of one that merely contains it", () => {
    expect(ids("quiz")).toEqual(["c", "d"]);
    expect(ids("studio")).toEqual(["b", "c"]);
  });

  it("limits the list", () => {
    const many = Array.from({ length: 80 }, (_, i) => cmd(`x${i}`, `Source ${i}`));
    expect(filterCommands(many, "source")).toHaveLength(50);
    expect(filterCommands(many, "source", 5)).toHaveLength(5);
  });
});
