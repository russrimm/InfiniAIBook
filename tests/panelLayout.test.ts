import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  columnWidth,
  panelMode,
  parseLayout,
  setPanel,
} from "@/lib/panelLayout";

describe("panel layout", () => {
  it("docks a pinned open panel, floats an unpinned one and rails a closed one", () => {
    expect(panelMode({ open: true, pinned: true })).toBe("docked");
    expect(panelMode({ open: true, pinned: false })).toBe("overlay");
    expect(panelMode({ open: false, pinned: true })).toBe("collapsed");
    expect(panelMode({ open: false, pinned: false })).toBe("collapsed");
  });

  it("gives the column its full width only when docked", () => {
    expect(columnWidth("left", { open: true, pinned: true })).toBe("320px");
    expect(columnWidth("right", { open: true, pinned: true })).toBe("380px");
    expect(columnWidth("left", { open: true, pinned: false })).toBe("44px");
    expect(columnWidth("right", { open: false, pinned: true })).toBe("44px");
  });

  it("falls back to the default for missing or malformed storage", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("null")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('{"left":{"open":"yes"},"right":7}')).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps the valid parts of a stored layout", () => {
    expect(parseLayout('{"left":{"open":false,"pinned":true},"right":{"pinned":false}}')).toEqual({
      left: { open: false, pinned: true },
      right: { open: true, pinned: false },
    });
  });

  it("changes one side without touching the other", () => {
    const next = setPanel(DEFAULT_LAYOUT, "right", { pinned: false });
    expect(next.right).toEqual({ open: true, pinned: false });
    expect(next.left).toBe(DEFAULT_LAYOUT.left);
    expect(DEFAULT_LAYOUT.right.pinned).toBe(true);
  });
});
