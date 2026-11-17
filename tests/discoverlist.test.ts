import { describe, expect, it } from "vitest";
import { appendHits, filterHits, groupHits, kindCounts } from "@/lib/discoverlist";
import type { DiscoverHit } from "@/components/DiscoverModal";

const hit = (n: number, kind?: string, extra: Partial<DiscoverHit> = {}): DiscoverHit => ({
  title: `Page ${n}`, url: `https://learn.microsoft.com/en-us/azure/page-${n}`, snippet: `Snippet ${n}`,
  host: "learn.microsoft.com", provider: "microsoft-learn", kind, ...extra,
});

describe("appendHits", () => {
  it("adds only new pages and never exceeds the limit", () => {
    const current = [hit(1), hit(2)];
    const next = appendHits(current, [hit(2, undefined, { url: current[1].url + "/" }), hit(3), hit(4), hit(5)], 4);
    expect(next.map((h) => h.title)).toEqual(["Page 1", "Page 2", "Page 3", "Page 4"]);
    expect(current).toHaveLength(2);
  });
});

describe("filterHits", () => {
  const all = [hit(1, "Documentation", { title: "Agent flows" }), hit(2, "Training", { title: "Agent basics" }), hit(3, "Documentation", { snippet: "Quotas" })];

  it("matches every typed word against title, snippet and URL", () => {
    expect(filterHits(all, "agent", null)).toHaveLength(2);
    expect(filterHits(all, "agent flows", null).map((h) => h.title)).toEqual(["Agent flows"]);
    expect(filterHits(all, "QUOTAS", null)).toHaveLength(1);
    expect(filterHits(all, "page-2", null)).toHaveLength(1);
  });

  it("limits to a content type", () => {
    expect(filterHits(all, "", "Training").map((h) => h.title)).toEqual(["Agent basics"]);
    expect(filterHits(all, "quotas", "Training")).toEqual([]);
  });
});

describe("kindCounts and groupHits", () => {
  const all = [hit(1, "Videos"), hit(2, "Documentation"), hit(3, "Zzz"), hit(4, "Documentation"), hit(5, "Training")];

  it("orders known content types first and keeps relevance order inside a group", () => {
    expect(kindCounts(all)).toEqual([
      { kind: "Documentation", count: 2 }, { kind: "Training", count: 1 },
      { kind: "Videos", count: 1 }, { kind: "Zzz", count: 1 },
    ]);
    expect(groupHits(all).map((g) => [g.kind, g.hits.map((h) => h.title)])).toEqual([
      ["Documentation", ["Page 2", "Page 4"]], ["Training", ["Page 5"]], ["Videos", ["Page 1"]], ["Zzz", ["Page 3"]],
    ]);
  });

  it("leaves untyped web results as one list", () => {
    expect(groupHits([hit(1), hit(2)])).toEqual([{ kind: null, hits: [hit(1), hit(2)] }]);
    expect(groupHits([])).toEqual([]);
  });
});
