import { describe, expect, it } from "vitest";
import { isTypingTarget, shortcutFor, SHORTCUTS } from "@/lib/shortcuts";

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget;

describe("shortcutFor", () => {
  it("maps ? to help and / to the question box", () => {
    expect(shortcutFor({ key: "?", target: el("BODY") })).toBe("help");
    expect(shortcutFor({ key: "/", target: el("DIV") })).toBe("focus-chat");
    expect(shortcutFor({ key: "x", target: el("BODY") })).toBeNull();
  });

  it("stays out of the way while typing", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(shortcutFor({ key: "/", target: el(tag) })).toBeNull();
    }
    expect(shortcutFor({ key: "?", target: el("DIV", { isContentEditable: true }) })).toBeNull();
  });

  it("ignores key chords, composition and key repeat", () => {
    for (const mod of ["ctrlKey", "altKey", "metaKey", "isComposing", "repeat"] as const) {
      expect(shortcutFor({ key: "/", [mod]: true, target: el("BODY") })).toBeNull();
    }
  });
});

describe("isTypingTarget", () => {
  it("is false for buttons, links and missing targets", () => {
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("A"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("SHORTCUTS", () => {
  it("lists the two global shortcuts that shortcutFor recognizes", () => {
    const keys = SHORTCUTS.flatMap((s) => s.keys);
    expect(keys).toContain("?");
    expect(keys).toContain("/");
  });
});
