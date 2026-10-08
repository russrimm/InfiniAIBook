import { describe, expect, it } from "vitest";
import { analyze, requestDetail } from "@/lib/explore";
import { isExplorable } from "@/lib/explorekinds";
import { parseDelimited, summarizeStructure, summarizeTable, xmlToValue } from "@/lib/datastruct";

const har = {
  log: {
    version: "1.2",
    creator: { name: "Firefox", version: "127.0" },
    pages: [{ id: "page_1", title: "Home", startedDateTime: "2024-06-19T08:54:12.581+02:00", pageTimings: { onContentLoad: 389, onLoad: 1329 } }],
    entries: [
      {
        pageref: "page_1",
        startedDateTime: "2024-06-19T08:54:12.581+02:00",
        time: 120,
        request: { method: "GET", url: "https://example.com/", headers: [], queryString: [] },
        response: {
          status: 200,
          statusText: "OK",
          headers: [{ name: "content-type", value: "text/html" }],
          content: { size: 5000, mimeType: "text/html; charset=utf-8", text: "<html></html>" },
          bodySize: 2000,
          headersSize: 300,
        },
        timings: { blocked: 1, dns: 2, connect: 10, ssl: 5, send: 1, wait: 90, receive: 11 },
      },
      {
        pageref: "page_1",
        startedDateTime: "2024-06-19T08:54:12.781+02:00",
        time: 50,
        request: { method: "POST", url: "http://api.example.com/x?a=1", headers: [], queryString: [{ name: "a", value: "1" }] },
        response: { status: 500, statusText: "", headers: [], content: { size: 10, mimeType: "application/json" }, bodySize: 10 },
        timings: { wait: 40, receive: 10 },
      },
    ],
  },
};

describe("summarizeStructure", () => {
  it("counts paths, types and values", () => {
    const s = summarizeStructure({ a: [{ n: 1 }, { n: 3 }, { n: null }], b: "x" });
    const n = s.nodes.find((x) => x.path === "$.a[].n")!;
    expect(n.count).toBe(3);
    expect(n.types).toEqual({ number: 2, null: 1 });
    expect(n.min).toBe(1);
    expect(n.max).toBe(3);
    expect(s.nodes.find((x) => x.path === "$.a")!.maxSize).toBe(3);
    expect(s.totals.maxDepth).toBe(3);
  });
});

describe("xmlToValue", () => {
  it("turns repeated elements into arrays and keeps attributes", () => {
    const v = xmlToValue('<gpx v="1"><trk><pt lat="1"><ele>5</ele></pt><pt lat="2"><ele>6</ele></pt></trk></gpx>') as {
      gpx: { "@v": string; trk: { pt: { "@lat": string; ele: string }[] } };
    };
    expect(v.gpx["@v"]).toBe("1");
    expect(v.gpx.trk.pt).toHaveLength(2);
    expect(v.gpx.trk.pt[1].ele).toBe("6");
  });
});

describe("tables", () => {
  it("parses quoted cells and infers column types", () => {
    expect(parseDelimited('a,b\n"x,1","he said ""hi"""\n', ",")).toEqual([["a", "b"], ["x,1", 'he said "hi"']]);
    const t = summarizeTable("n,name\n1,a\n2,b\n2,b\n", ",");
    expect(t.rows).toBe(3);
    expect(t.columns[0]).toMatchObject({ type: "integer", min: 1, max: 2, median: 2 });
    expect(t.duplicateRows).toBe(1);
  });
});

describe("analyze", () => {
  it("recognizes a HAR and summarizes it", () => {
    const a = analyze(JSON.stringify(har), "har");
    if (a.format !== "har") throw new Error("expected har");
    expect(a.har.totals.requests).toBe(2);
    expect(a.har.totals.failed).toBe(1);
    expect(a.har.totals.insecure).toBe(1);
    expect(a.har.pages[0]).toMatchObject({ onLoad: 1329, requests: 2 });
    expect(a.har.requests[0].host).toBe("example.com");
    expect(a.har.requests[1].offset).toBe(200);
    expect(a.har.phases.connect).toBe(5);
    expect(a.har.findings.length).toBeGreaterThan(0);
  });

  it("sniffs plain JSON and returns request detail", () => {
    expect(analyze('{"a":1}', "text").format).toBe("json");
    const d = requestDetail(JSON.stringify(har), "json", 1)!;
    expect(d.request.query).toEqual([["a", "1"]]);
    expect(requestDetail(JSON.stringify(har), "json", 9)).toBeNull();
  });

  it("rejects prose and knows explorable kinds", () => {
    expect(() => analyze("just some words", "txt")).toThrow(/no structure/);
    expect(isExplorable("HAR")).toBe(true);
    expect(isExplorable("pdf")).toBe(false);
  });
});
