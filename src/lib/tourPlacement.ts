/**
 * Where a guided-tour card and its arrow go relative to the element they point
 * at. Pure, so it can be tested without a browser: the caller measures.
 */

export type Box = { top: number; left: number; width: number; height: number };
export type Placement = "left" | "right" | "top" | "bottom";

/** Room between target and card, which the arrow sits in. */
export const TOUR_GAP = 48;
/** The arrow is drawn in a square of this size, pointing left before rotation. */
export const ARROW_SIZE = 32;
const MARGIN = 12;
const OPPOSITE: Record<Placement, Placement> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};
/** Rotation that turns the left-pointing arrow toward the target. */
const ROTATE: Record<Placement, number> = { right: 0, left: 180, top: -90, bottom: 90 };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, Math.max(min, max)));
}

function cardAt(t: Box, card: { width: number; height: number }, p: Placement) {
  const cx = t.left + t.width / 2;
  const cy = t.top + t.height / 2;
  switch (p) {
    case "right":
      return { left: t.left + t.width + TOUR_GAP, top: cy - card.height / 2 };
    case "left":
      return { left: t.left - TOUR_GAP - card.width, top: cy - card.height / 2 };
    case "top":
      return { left: cx - card.width / 2, top: t.top - TOUR_GAP - card.height };
    case "bottom":
      return { left: cx - card.width / 2, top: t.top + t.height + TOUR_GAP };
  }
}

function fits(pos: { left: number; top: number }, card: { width: number; height: number }, view: { width: number; height: number }) {
  return (
    pos.left >= MARGIN &&
    pos.top >= MARGIN &&
    pos.left + card.width <= view.width - MARGIN &&
    pos.top + card.height <= view.height - MARGIN
  );
}

export function placeTourCard(
  target: Box,
  card: { width: number; height: number },
  view: { width: number; height: number },
  preferred: Placement
) {
  let placement = preferred;
  let pos = cardAt(target, card, placement);
  // Only the main axis matters for flipping; the cross axis is clamped below.
  const mainAxisFits = (p: Placement, at: { left: number; top: number }) =>
    p === "left" || p === "right"
      ? fits({ left: at.left, top: MARGIN }, { width: card.width, height: 0 }, view)
      : fits({ left: MARGIN, top: at.top }, { width: 0, height: card.height }, view);
  if (!mainAxisFits(placement, pos)) {
    const flipped = OPPOSITE[placement];
    const alt = cardAt(target, card, flipped);
    if (mainAxisFits(flipped, alt)) {
      placement = flipped;
      pos = alt;
    }
  }

  const left = clamp(pos.left, MARGIN, view.width - card.width - MARGIN);
  const top = clamp(pos.top, MARGIN, view.height - card.height - MARGIN);

  const half = ARROW_SIZE / 2;
  const cx = clamp(target.left + target.width / 2, MARGIN, view.width - MARGIN);
  const cy = clamp(target.top + target.height / 2, MARGIN, view.height - MARGIN);
  const inset = (TOUR_GAP - ARROW_SIZE) / 2;
  const arrow =
    placement === "right"
      ? { left: target.left + target.width + inset, top: cy - half }
      : placement === "left"
        ? { left: target.left - inset - ARROW_SIZE, top: cy - half }
        : placement === "top"
          ? { left: cx - half, top: target.top - inset - ARROW_SIZE }
          : { left: cx - half, top: target.top + target.height + inset };

  return { placement, card: { left, top }, arrow: { ...arrow, rotate: ROTATE[placement] } };
}
