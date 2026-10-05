import { describe, expect, it } from "vitest";
import { TOUR_GAP, placeTourCard } from "@/lib/tourPlacement";

const view = { width: 1440, height: 900 };
const card = { width: 320, height: 200 };

describe("tour card placement", () => {
  it("puts the card beside the target with the arrow pointing back at it", () => {
    const target = { left: 20, top: 100, width: 280, height: 60 };
    const r = placeTourCard(target, card, view, "right");
    expect(r.placement).toBe("right");
    expect(r.card.left).toBe(300 + TOUR_GAP);
    expect(r.arrow.rotate).toBe(0);
    expect(r.arrow.left).toBeGreaterThan(300);
    expect(r.arrow.left).toBeLessThan(r.card.left);
  });

  it("flips to the other side when the preferred one is off screen", () => {
    const target = { left: 1060, top: 60, width: 380, height: 800 };
    const r = placeTourCard(target, card, view, "right");
    expect(r.placement).toBe("left");
    expect(r.card.left + card.width).toBeLessThanOrEqual(1060);
    expect(r.arrow.rotate).toBe(180);
  });

  it("keeps the card inside the viewport on the cross axis", () => {
    const target = { left: 20, top: 860, width: 100, height: 30 };
    const r = placeTourCard(target, card, view, "right");
    expect(r.card.top + card.height).toBeLessThanOrEqual(view.height - 12);
  });

  it("points down from above and up from below", () => {
    const target = { left: 500, top: 800, width: 400, height: 50 };
    expect(placeTourCard(target, card, view, "top").arrow.rotate).toBe(-90);
    const high = { left: 500, top: 50, width: 400, height: 50 };
    expect(placeTourCard(high, card, view, "bottom").arrow.rotate).toBe(90);
  });
});
