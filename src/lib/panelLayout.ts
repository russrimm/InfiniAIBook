/**
 * The workspace's side panels (Sources on the left, Studio/Notes on the right)
 * on wide screens. Each is open or collapsed to a slim rail, and pinned or not:
 *
 * - open and pinned: docked in its column beside the chat;
 * - open and unpinned: floats over the chat and folds away on a click elsewhere;
 * - collapsed: a rail that reopens it.
 *
 * The choice is remembered per browser, not per notebook.
 */

export type PanelSide = "left" | "right";
export type PanelState = { open: boolean; pinned: boolean };
export type PanelLayout = Record<PanelSide, PanelState>;
export type PanelMode = "docked" | "overlay" | "collapsed";

export const LAYOUT_KEY = "infiniaibook.layout";
export const TOUR_KEY = "infiniaibook.tour";

export const PANEL_WIDTH: Record<PanelSide, number> = { left: 320, right: 380 };
export const RAIL_WIDTH = 44;

export const DEFAULT_LAYOUT: PanelLayout = {
  left: { open: true, pinned: true },
  right: { open: true, pinned: true },
};

export function panelMode(s: PanelState): PanelMode {
  if (!s.open) return "collapsed";
  return s.pinned ? "docked" : "overlay";
}

/** The width a panel takes in the grid; a floating panel leaves only its rail. */
export function columnWidth(side: PanelSide, s: PanelState): string {
  return `${panelMode(s) === "docked" ? PANEL_WIDTH[side] : RAIL_WIDTH}px`;
}

function parseState(v: unknown, fallback: PanelState): PanelState {
  if (!v || typeof v !== "object") return fallback;
  const o = v as Record<string, unknown>;
  return {
    open: typeof o.open === "boolean" ? o.open : fallback.open,
    pinned: typeof o.pinned === "boolean" ? o.pinned : fallback.pinned,
  };
}

/** Read a stored layout, falling back to the default for anything unusable. */
export function parseLayout(raw: string | null | undefined): PanelLayout {
  if (!raw) return DEFAULT_LAYOUT;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== "object") return DEFAULT_LAYOUT;
    return {
      left: parseState(v.left, DEFAULT_LAYOUT.left),
      right: parseState(v.right, DEFAULT_LAYOUT.right),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function setPanel(
  layout: PanelLayout,
  side: PanelSide,
  patch: Partial<PanelState>
): PanelLayout {
  return { ...layout, [side]: { ...layout[side], ...patch } };
}
