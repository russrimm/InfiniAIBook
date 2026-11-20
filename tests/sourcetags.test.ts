import { beforeEach, describe, expect, it } from "vitest";
import { DELETE as bulkDelete, POST as bulkPost } from "@/app/api/notebooks/[id]/sources/bulk/route";
import { GET as notebookGet } from "@/app/api/notebooks/[id]/route";
import { PATCH as patchSource } from "@/app/api/sources/[id]/route";
import { db } from "@/lib/db";
import { exportNotebookZip, importNotebookZip } from "@/lib/notebookpack";
import { MAX_TAGS, hasTag, normalizeTag, normalizeTags, parseTags, tagCounts, withTag, withoutTag } from "@/lib/tags";
import { count, idCtx, request, resetNotebooks, seedNotebook, seedSource } from "./routehelpers";

describe("tag helpers", () => {
  it("cleans a tag: whitespace, commas, control characters, length", () => {
    expect(normalizeTag("  Q3   filings ")).toBe("Q3 filings");
    expect(normalizeTag("a,b\u0000c")).toBe("a b c");
    expect(normalizeTag("x".repeat(80))).toHaveLength(32);
    expect(normalizeTag(42)).toBe("");
  });

  it("drops blanks and duplicates ignoring case, keeps the first spelling, and stops at 8", () => {
    expect(normalizeTags("Papers, papers, , Notes")).toEqual(["Papers", "Notes"]);
    expect(normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
    expect(normalizeTags({ not: "a list" })).toEqual([]);
  });

  it("adds and removes without regard to case, and reads damaged storage as no tags", () => {
    expect(withTag(["Papers"], "papers")).toEqual(["Papers"]);
    expect(withTag(["a"], "b")).toEqual(["a", "b"]);
    expect(withoutTag(["Papers", "x"], "PAPERS")).toEqual(["x"]);
    expect(hasTag(["Papers"], "papers")).toBe(true);
    expect(parseTags("not json")).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags('["a","A","b"]')).toEqual(["a", "b"]);
  });

  it("counts tags in use, alphabetically", () => {
    expect(tagCounts([{ tags: ["b", "A"] }, { tags: ["a"] }, {}])).toEqual([
      { tag: "A", count: 2 },
      { tag: "b", count: 1 },
    ]);
  });
});

describe("tagging sources", () => {
  beforeEach(() => resetNotebooks());

  const tagsOf = (id: string) => parseTags((db.prepare("SELECT tags FROM sources WHERE id = ?").get(id) as unknown as { tags: string | null }).tags);
  const bulk = (nb: string, body: unknown) => bulkPost(request(`/api/notebooks/${nb}/sources/bulk`, "POST", body), idCtx(nb));

  it("sets one source's tags with PATCH and lists them on the notebook", async () => {
    const nb = seedNotebook();
    const a = seedSource(nb, { title: "A" });
    const res = await patchSource(request(`/api/sources/${a}`, "PATCH", { tags: "Interviews, 2024, interviews" }), idCtx(a));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { tags: string[] }).tags).toEqual(["Interviews", "2024"]);
    const nbRes = await notebookGet(request(`/api/notebooks/${nb}`), idCtx(nb));
    const body = (await nbRes.json()) as { sources: { id: string; tags: string[] }[] };
    expect(body.sources.find((s) => s.id === a)?.tags).toEqual(["Interviews", "2024"]);
    expect((await patchSource(request(`/api/sources/${a}`, "PATCH", { tags: 5 }), idCtx(a))).status).toBe(400);
    expect((await patchSource(request("/api/sources/nope", "PATCH", { tags: [] }), idCtx("nope"))).status).toBe(404);
  });

  it("tags many sources at once and undoes it from the reply", async () => {
    const nb = seedNotebook();
    const [a, b, c] = [seedSource(nb), seedSource(nb), seedSource(nb)];
    db.prepare("UPDATE sources SET tags = ? WHERE id = ?").run('["keep"]', b);

    const res = await bulk(nb, { action: "addTag", ids: [a, b], tag: "Papers" });
    const j = (await res.json()) as { updated: number; previous: Record<string, string[]> };
    expect(j.updated).toBe(2);
    expect(tagsOf(a)).toEqual(["Papers"]);
    expect(tagsOf(b)).toEqual(["keep", "Papers"]);
    expect(tagsOf(c)).toEqual([]);
    expect(j.previous).toEqual({ [a]: [], [b]: ["keep"] });

    const again = (await (await bulk(nb, { action: "addTag", ids: [a, b], tag: "papers" })).json()) as { updated: number };
    expect(again.updated).toBe(0);

    const undone = await bulk(nb, { action: "restore", tags: j.previous });
    expect(((await undone.json()) as { updated: number }).updated).toBe(2);
    expect(tagsOf(a)).toEqual([]);
    expect(tagsOf(b)).toEqual(["keep"]);
  });

  it("removes a tag, and reports sources that are full", async () => {
    const nb = seedNotebook();
    const a = seedSource(nb);
    const full = seedSource(nb);
    db.prepare("UPDATE sources SET tags = ? WHERE id = ?").run('["x","y"]', a);
    db.prepare("UPDATE sources SET tags = ? WHERE id = ?").run(JSON.stringify(Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`)), full);

    expect(((await (await bulk(nb, { action: "removeTag", ids: [a], tag: "X" })).json()) as { updated: number }).updated).toBe(1);
    expect(tagsOf(a)).toEqual(["y"]);
    const r = (await (await bulk(nb, { action: "addTag", ids: [full], tag: "extra" })).json()) as { updated: number; skipped: number };
    expect(r).toMatchObject({ updated: 0, skipped: 1 });
  });

  it("only touches sources in this notebook and refuses bad requests", async () => {
    const nb = seedNotebook();
    const other = seedNotebook("Other");
    const foreign = seedSource(other);
    expect((await bulk(nb, { action: "addTag", ids: [foreign], tag: "x" })).status).toBe(404);
    expect(tagsOf(foreign)).toEqual([]);
    expect((await bulk(nb, { action: "addTag", ids: [], tag: "x" })).status).toBe(400);
    expect((await bulk(nb, { action: "addTag", ids: ["a"], tag: "  " })).status).toBe(400);
    expect((await bulk(nb, { action: "explode", ids: ["a"], tag: "x" })).status).toBe(400);
    expect((await bulk(nb, { action: "addTag", ids: Array.from({ length: 501 }, (_, i) => `id${i}`), tag: "x" })).status).toBe(400);
  });

  it("deletes many sources in one request, only in this notebook", async () => {
    const nb = seedNotebook();
    const other = seedNotebook("Other");
    const [a, b] = [seedSource(nb), seedSource(nb)];
    const keep = seedSource(nb);
    const foreign = seedSource(other);
    const res = await bulkDelete(request(`/api/notebooks/${nb}/sources/bulk?ids=${a},${b},${foreign}`, "DELETE"), idCtx(nb));
    expect(((await res.json()) as { deleted: number }).deleted).toBe(2);
    expect(count("sources", "id = ?", keep)).toBe(1);
    expect(count("sources", "id = ?", foreign)).toBe(1);
    expect(count("chunks", "source_id = ?", a)).toBe(0);
    expect((await bulkDelete(request(`/api/notebooks/${nb}/sources/bulk`, "DELETE"), idCtx(nb))).status).toBe(400);
  });
});

describe("tags in notebook exports", () => {
  beforeEach(() => resetNotebooks());

  it("travel with the export and come back on import; older exports without tags still import", async () => {
    const nb = seedNotebook("Tagged");
    const a = seedSource(nb, { title: "A", chunks: ["tagged text"] });
    db.prepare("UPDATE sources SET tags = ? WHERE id = ?").run('["Papers","2024"]', a);
    const pack = await exportNotebookZip(nb);
    const created = await importNotebookZip(pack!.buffer);
    const row = db.prepare("SELECT tags FROM sources WHERE notebook_id = ?").get(created.id) as unknown as { tags: string | null };
    expect(parseTags(row.tags)).toEqual(["Papers", "2024"]);
  });
});
