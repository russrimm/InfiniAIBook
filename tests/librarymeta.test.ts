import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { GET } from "@/app/api/notebooks/[id]/route";
import { exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { INFOGRAPHIC_STYLES, STYLE_ORDER } from "@/lib/infographic";
import { filterLibrary, infographicStyleLabel, isLibrarySort, libraryMeta, sortLibrary } from "@/lib/librarymeta";

const WHEN = new Date(2026, 10, 19, 8, 49, 25).getTime();
const stamp = new Date(WHEN).toLocaleString();

describe("Library subtitle", () => {
  it("puts the style's option label between the kind and the date", () => {
    expect(libraryMeta({ type: "infographic", style: "bento", createdAt: WHEN })).toBe(
      `Infographic · ${INFOGRAPHIC_STYLES.bento.label} · ${stamp}`
    );
    // Aliases resolve to the style they were folded into.
    expect(libraryMeta({ type: "infographic", style: "isometric", createdAt: WHEN })).toContain(
      INFOGRAPHIC_STYLES.process.label
    );
  });

  it("names every style by its label, never its key", () => {
    for (const key of STYLE_ORDER) {
      expect(infographicStyleLabel(key)).toBe(INFOGRAPHIC_STYLES[key].label);
    }
  });

  it("shows older infographics, which render in the original look, as Classic", () => {
    for (const style of [undefined, null, ""]) {
      expect(libraryMeta({ type: "infographic", style, createdAt: WHEN })).toBe(`Infographic · Classic · ${stamp}`);
    }
  });

  it("leaves out a style key this build does not know instead of guessing", () => {
    expect(libraryMeta({ type: "infographic", style: "from-the-future", createdAt: WHEN })).toBe(`Infographic · ${stamp}`);
    expect(libraryMeta({ type: "infographic", style: "constructor", createdAt: WHEN })).toBe(`Infographic · ${stamp}`);
  });

  it("does not add a style to other formats", () => {
    expect(libraryMeta({ type: "report", style: "bento", createdAt: WHEN })).toBe(`Report · ${stamp}`);
    expect(libraryMeta({ type: "mindmap", createdAt: WHEN })).toBe(`Mind map · ${stamp}`);
  });
});

function seed() {
  const nb = nanoid(12);
  db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(nb, "Styles", "S", 1);
  const add = (type: string, title: string, content: string, at: number) =>
    db.prepare("INSERT INTO artifacts (id, notebook_id, type, title, content, created_at) VALUES (?,?,?,?,?,?)")
      .run(nanoid(12), nb, type, title, content, at);
  add("infographic", "Blueprint one", JSON.stringify({ title: "x", style: "blueprint", sections: [] }), 6);
  add("infographic", "Old one", JSON.stringify({ title: "x", sections: [] }), 5);
  add("infographic", "Corrupt one", "{not json", 4);
  add("report", "A report", JSON.stringify({ title: "r", markdown: "m", style: "bento" }), 3);
  return nb;
}

describe("notebook listing", () => {
  it("lists each infographic's saved style without shipping any artifact body", async () => {
    const nb = seed();
    const res = await GET(new Request(`http://localhost/api/notebooks/${nb}`), { params: Promise.resolve({ id: nb }) });
    expect(res.status).toBe(200);
    const { artifacts } = (await res.json()) as { artifacts: Record<string, unknown>[] };
    const byTitle = Object.fromEntries(artifacts.map((a) => [a.title as string, a]));
    expect(byTitle["Blueprint one"].style).toBe("blueprint");
    expect(byTitle["Old one"]).not.toHaveProperty("style");
    expect(byTitle["Corrupt one"]).not.toHaveProperty("style");
    expect(byTitle["A report"]).not.toHaveProperty("style");
    for (const a of artifacts) expect(a).not.toHaveProperty("content");
  });

  it("keeps the style through a notebook export and import", async () => {
    const nb = seed();
    const packed = await exportNotebookZip(nb);
    const imported = await importNotebookZip(packed!.buffer);
    const res = await GET(new Request(`http://localhost/api/notebooks/${imported.id}`), {
      params: Promise.resolve({ id: imported.id }),
    });
    const { artifacts } = (await res.json()) as { artifacts: { title: string; style?: string }[] };
    expect(artifacts.find((a) => a.title === "Blueprint one")?.style).toBe("blueprint");
    expect(artifacts.find((a) => a.title === "Old one")?.style).toBeUndefined();
  });
});

describe("filterLibrary", () => {
  const items = [
    { title: "Soil report", type: "report" },
    { title: "River quiz", type: "quiz" },
    { title: "Water cycle", type: "infographic", style: "bento" },
    { title: "Old poster", type: "infographic" },
  ];

  it("returns everything for an empty or blank query", () => {
    expect(filterLibrary(items, "")).toHaveLength(4);
    expect(filterLibrary(items, "   ")).toHaveLength(4);
  });

  it("matches the title, the format and the infographic style, case-insensitively", () => {
    expect(filterLibrary(items, "RIVER").map((a) => a.title)).toEqual(["River quiz"]);
    expect(filterLibrary(items, "quiz").map((a) => a.title)).toEqual(["River quiz"]);
    expect(filterLibrary(items, INFOGRAPHIC_STYLES.bento.label.toLowerCase()).map((a) => a.title)).toEqual(["Water cycle"]);
    // An infographic saved before styles existed shows as Classic.
    expect(filterLibrary(items, INFOGRAPHIC_STYLES.classic.label).map((a) => a.title)).toEqual(["Old poster"]);
  });

  it("needs every word to match, and ignores the date", () => {
    expect(filterLibrary(items, "infographic water").map((a) => a.title)).toEqual(["Water cycle"]);
    expect(filterLibrary(items, "water river")).toEqual([]);
    expect(filterLibrary(items, String(new Date().getFullYear()))).toEqual([]);
  });
});

describe("Library sort", () => {
  const rows = [
    { title: "quiz 10", type: "quiz", createdAt: 3 },
    { title: "Quiz 2", type: "quiz", createdAt: 1 },
    { title: "Atlas", type: "report", createdAt: 2 },
    { title: "atlas", type: "faq", createdAt: 4 },
  ];
  const titles = (s: Parameters<typeof sortLibrary>[1]) => sortLibrary(rows, s).map((r) => r.title);

  it("orders by date either way, by name ignoring case and reading numbers, and by format", () => {
    expect(titles("newest")).toEqual(["atlas", "quiz 10", "Atlas", "Quiz 2"]);
    expect(titles("oldest")).toEqual(["Quiz 2", "Atlas", "quiz 10", "atlas"]);
    // Equal names fall back to newest first; "Quiz 2" comes before "quiz 10".
    expect(titles("name")).toEqual(["atlas", "Atlas", "Quiz 2", "quiz 10"]);
    // FAQ, Quiz and Report in alphabetical order of their labels, newest first within each.
    expect(sortLibrary(rows, "type").map((r) => r.type)).toEqual(["faq", "quiz", "quiz", "report"]);
  });

  it("never changes the list it is given, and knows its own keys", () => {
    const before = rows.map((r) => r.title);
    sortLibrary(rows, "name");
    expect(rows.map((r) => r.title)).toEqual(before);
    expect(isLibrarySort("name")).toBe(true);
    expect(isLibrarySort("size")).toBe(false);
  });
});