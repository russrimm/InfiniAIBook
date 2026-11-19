import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { GET } from "@/app/api/notebooks/[id]/route";
import { exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { INFOGRAPHIC_STYLES, STYLE_ORDER } from "@/lib/infographic";
import { infographicStyleLabel, libraryMeta } from "@/lib/librarymeta";

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
