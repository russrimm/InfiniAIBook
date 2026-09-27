import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  keywordScore,
  pickSample,
  queryTerms,
  retrieve,
  sampleCorpus,
  spreadOrder,
} from "@/lib/retrieve";

const chunk = (idx: number, len = 1400) => ({ idx, text: `${idx}`.padEnd(len, "x") });

describe("spreadOrder", () => {
  it("is a permutation that starts at the opening", () => {
    for (const n of [1, 2, 5, 17, 64]) {
      const o = spreadOrder(n);
      expect(o[0]).toBe(0);
      expect([...o].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it("reaches the middle early", () => {
    expect(spreadOrder(10).slice(0, 2)).toEqual([0, 5]);
  });
});

describe("pickSample", () => {
  it("represents every source when there are more sources than whole chunks fit", () => {
    const sources = Array.from({ length: 30 }, () => Array.from({ length: 5 }, (_, i) => chunk(i)));
    const { picked, truncated } = pickSample(sources, 30000);
    const total = picked.reduce((s, c) => s + c.text.length, 0);
    expect(total).toBeLessThanOrEqual(30000);
    // Each of the 30 sources has at least its opening passage.
    const perSource = sources.map((list) => picked.filter((p) => list.some((c) => c.idx === p.idx)).length);
    expect(perSource.every((n) => n >= 1)).toBe(true);
    expect(picked.length).toBeGreaterThanOrEqual(30);
    expect(truncated).toBe(30);
  });

  it("keeps whole chunks and spreads extra budget round-robin", () => {
    const sources = [
      Array.from({ length: 10 }, (_, i) => chunk(i, 1000)),
      Array.from({ length: 10 }, (_, i) => chunk(i, 1000)),
    ];
    const { picked, truncated } = pickSample(sources, 6000);
    expect(truncated).toBe(0);
    expect(picked.length).toBe(6);
    // Three from each, in document order within a source.
    expect(picked.slice(0, 3).map((c) => c.idx)).toEqual([0, 2, 5]);
  });

  it("includes everything when it fits", () => {
    const sources = [[chunk(0, 100), chunk(1, 100)], [chunk(0, 100)]];
    expect(pickSample(sources, 10000).picked.length).toBe(3);
  });

  it("handles no sources", () => {
    expect(pickSample([], 1000).picked).toEqual([]);
  });
});

describe("keyword scoring", () => {
  it("keeps acronyms and non-English words", () => {
    expect(queryTerms("What is the API for SQL?")).toEqual(["api", "sql"]);
    expect(new Set(queryTerms("How does AI help the EU?"))).toEqual(new Set(["ai", "help", "eu"]));
    expect(queryTerms("Qu'est-ce que l'énergie nucléaire ?")).toContain("énergie");
    expect(queryTerms("量子コンピュータとは")).toHaveLength(1);
  });

  it("drops two-letter lowercase words", () => {
    expect(queryTerms("is it on")).toEqual([]);
  });

  it("matches at word starts only", () => {
    expect(keywordScore("She said nothing.", "AI")).toBe(0);
    expect(keywordScore("AI models are everywhere.", "AI")).toBe(1);
    expect(keywordScore("La énergie nucléaire", "énergie")).toBe(1);
  });
});

function seedNotebook(sources: number, chunksPer: number, text = (s: number, c: number) => `Source ${s} chunk ${c} `.padEnd(1400, "y")) {
  const nb = nanoid(12);
  db.prepare("INSERT INTO notebooks (id, title, emoji, created_at) VALUES (?,?,?,?)").run(nb, "T", "📓", Date.now());
  const ids: string[] = [];
  for (let s = 0; s < sources; s++) {
    const sid = nanoid(12);
    ids.push(sid);
    db.prepare(
      "INSERT INTO sources (id, notebook_id, title, kind, url, text, chars, created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).run(sid, nb, `S${s}`, "text", null, "t", 1, s);
    for (let c = 0; c < chunksPer; c++) {
      db.prepare(
        "INSERT INTO chunks (id, source_id, notebook_id, idx, text) VALUES (?,?,?,?,?)"
      ).run(nanoid(12), sid, nb, c, text(s, c));
    }
  }
  return { nb, ids };
}

describe("sampleCorpus", () => {
  it("covers all 30 sources of a large notebook", () => {
    const { nb, ids } = seedNotebook(30, 5);
    const passages = sampleCorpus(nb, undefined, 30000);
    expect(new Set(passages.map((p) => p.sourceId)).size).toBe(30);
    expect(passages.reduce((s, p) => s + p.text.length, 0)).toBeLessThanOrEqual(30000);
    expect(sampleCorpus(nb, ids.slice(0, 2), 30000).every((p) => ids.slice(0, 2).includes(p.sourceId))).toBe(true);
  });

  it("returns nothing for an explicit empty selection", async () => {
    const { nb } = seedNotebook(2, 2);
    expect(sampleCorpus(nb, [], 30000)).toEqual([]);
    expect(await retrieve(nb, "chunk", [], 12)).toEqual([]);
    expect(sampleCorpus(nb, undefined, 30000).length).toBe(4);
  });
});
