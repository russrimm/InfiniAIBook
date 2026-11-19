import { describe, expect, it, vi } from "vitest";
import { dataUrlToBlob, exportErrorMessage, rasterize } from "@/lib/imageexport";

const node = {} as HTMLElement;
const png = new Blob(["png"], { type: "image/png" });

describe("dataUrlToBlob", () => {
  it("decodes base64 and plain data URLs without a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const b = dataUrlToBlob("data:image/png;base64,aGk=");
    expect(b.type).toBe("image/png");
    expect(await b.text()).toBe("hi");
    const svg = dataUrlToBlob("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    expect(svg.type).toBe("image/svg+xml");
    expect(await svg.text()).toBe("<svg/>");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses something that is not a data URL", () => {
    expect(() => dataUrlToBlob("https://example.com/x.png")).toThrow(/format/);
  });
});

describe("exportErrorMessage", () => {
  it("never shows a bare 'Failed to fetch'", () => {
    for (const raw of ["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed", ""]) {
      const msg = exportErrorMessage(new Error(raw));
      expect(msg).not.toBe(raw);
      expect(msg).toContain("Could not export an image");
      expect(msg).toContain("Markdown");
    }
  });

  it("explains blocked images and oversized canvases, and passes other reasons through", () => {
    expect(exportErrorMessage(new Error("Failed to execute 'toBlob': Tainted canvases"))).toContain("will not let a page copy");
    expect(exportErrorMessage(new Error("Canvas exceeds max size"))).toContain("too large");
    expect(exportErrorMessage(new Error("Nothing to export."), "export a PNG")).toBe("Could not export a PNG: Nothing to export.");
  });
});

describe("rasterize", () => {
  it("returns a PNG at double resolution when the browser can draw it", async () => {
    const toBlob = vi.fn().mockResolvedValue(png);
    const out = await rasterize(node, "#fff", { toBlob, toSvg: vi.fn() });
    expect(out).toEqual({ blob: png, ext: "png" });
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0][1]).toMatchObject({ pixelRatio: 2, backgroundColor: "#fff", skipFonts: true });
  });

  it("retries at normal resolution when the canvas is too large", async () => {
    const toBlob = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(png);
    const out = await rasterize(node, "#fff", { toBlob, toSvg: vi.fn() });
    expect(out.ext).toBe("png");
    expect(toBlob.mock.calls.map((c) => c[1].pixelRatio)).toEqual([2, 1]);
  });

  it("falls back to an SVG with a note when no PNG can be made", async () => {
    const toBlob = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const toSvg = vi.fn().mockResolvedValue("data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    const out = await rasterize(node, "#fff", { toBlob, toSvg });
    expect(out.ext).toBe("svg");
    expect(out.note).toContain("SVG");
    expect(await out.blob.text()).toBe("<svg/>");
  });

  it("throws the real reason when nothing can be drawn", async () => {
    const toBlob = vi.fn().mockRejectedValue(new Error("Canvas exceeds max size"));
    const toSvg = vi.fn().mockRejectedValue(new Error("svg failed"));
    await expect(rasterize(node, "#fff", { toBlob, toSvg })).rejects.toThrow("Canvas exceeds max size");
  });
});
