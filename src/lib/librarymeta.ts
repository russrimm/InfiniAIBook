import { INFOGRAPHIC_STYLES, knownStyle } from "./infographic";
import { studioLabel } from "./studio";

/**
 * The style an infographic is shown in, as the name used in the Infographic
 * options. Artifacts saved before styles existed carry no key and render in
 * the original look, which is the Classic style. A key this build does not
 * know has no honest name, so it is left out rather than guessed.
 */
export function infographicStyleLabel(style: unknown): string | undefined {
  if (style === undefined || style === null || style === "") return INFOGRAPHIC_STYLES.classic.label;
  const key = knownStyle(style);
  return key ? INFOGRAPHIC_STYLES[key].label : undefined;
}

/** The "kind · style · date" line under a Library entry. */
export function libraryMeta(
  artifact: { type: string; style?: string | null; createdAt: number },
  locale?: string
): string {
  return [
    studioLabel(artifact.type),
    artifact.type === "infographic" ? infographicStyleLabel(artifact.style) : undefined,
    new Date(artifact.createdAt).toLocaleString(locale),
  ]
    .filter(Boolean)
    .join(" · ");
}
