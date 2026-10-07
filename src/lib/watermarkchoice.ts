/**
 * The watermark a video format carries: a line of text or an uploaded image,
 * stamped in one of nine places on every frame. Pure and client-safe; the
 * image library and the stamping itself live in watermark.ts.
 */

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type WatermarkSize = "small" | "medium" | "large";
export type WatermarkOpacity = "faint" | "medium" | "solid";

type WatermarkLayout = {
  position: WatermarkPosition;
  size: WatermarkSize;
  opacity: WatermarkOpacity;
};

export type WatermarkChoice =
  | (WatermarkLayout & { kind: "text"; text: string })
  | (WatermarkLayout & { kind: "image"; image: string });

export type WatermarkImage = {
  id: string;
  name: string;
  bytes: number;
};

/** In reading order, so they lay out as a 3 × 3 grid. */
export const WATERMARK_POSITIONS: { key: WatermarkPosition; label: string }[] = [
  { key: "top-left", label: "Top left" },
  { key: "top-center", label: "Top center" },
  { key: "top-right", label: "Top right" },
  { key: "middle-left", label: "Middle left" },
  { key: "center", label: "Center" },
  { key: "middle-right", label: "Middle right" },
  { key: "bottom-left", label: "Bottom left" },
  { key: "bottom-center", label: "Bottom center" },
  { key: "bottom-right", label: "Bottom right" },
];

/**
 * `width` and `height` bound an image as fractions of the frame; `text` is the
 * text height as a fraction of the frame height.
 */
export const WATERMARK_SIZES: Record<
  WatermarkSize,
  { label: string; width: number; height: number; text: number }
> = {
  small: { label: "Small", width: 0.12, height: 0.1, text: 0.032 },
  medium: { label: "Medium", width: 0.18, height: 0.15, text: 0.045 },
  large: { label: "Large", width: 0.26, height: 0.22, text: 0.065 },
};

export const WATERMARK_OPACITIES: Record<WatermarkOpacity, { label: string; alpha: number }> = {
  faint: { label: "Faint", alpha: 0.35 },
  medium: { label: "Medium", alpha: 0.6 },
  solid: { label: "Solid", alpha: 0.9 },
};

export const DEFAULT_WATERMARK_LAYOUT: WatermarkLayout = {
  position: "bottom-right",
  size: "medium",
  opacity: "medium",
};

export const MAX_WATERMARK_TEXT = 80;
export const MAX_WATERMARK_BYTES = 5 * 1024 * 1024;
/** Uploads are converted to PNG in the browser, no larger than this on either side. */
export const WATERMARK_MAX_SIDE = 1024;

const IMAGE_ID = /^w-[A-Za-z0-9_-]{10}$/;
export const isWatermarkImageId = (v: unknown): v is string =>
  typeof v === "string" && IMAGE_ID.test(v);

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Null means no watermark. Anything malformed or empty is treated as none. */
export function normalizeWatermark(v: unknown): WatermarkChoice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const layout: WatermarkLayout = {
    position: pick(
      o.position,
      WATERMARK_POSITIONS.map((p) => p.key),
      DEFAULT_WATERMARK_LAYOUT.position
    ),
    size: pick(
      o.size,
      Object.keys(WATERMARK_SIZES) as WatermarkSize[],
      DEFAULT_WATERMARK_LAYOUT.size
    ),
    opacity: pick(
      o.opacity,
      Object.keys(WATERMARK_OPACITIES) as WatermarkOpacity[],
      DEFAULT_WATERMARK_LAYOUT.opacity
    ),
  };
  if (o.kind === "text") {
    const text =
      typeof o.text === "string"
        ? o.text
            // Control characters would reach the renderer as boxes.
            .replace(/[\u0000-\u001f\u007f]+/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim()
            .slice(0, MAX_WATERMARK_TEXT)
        : "";
    return text ? { kind: "text", text, ...layout } : null;
  }
  if (o.kind === "image") {
    return isWatermarkImageId(o.image) ? { kind: "image", image: o.image, ...layout } : null;
  }
  return null;
}
