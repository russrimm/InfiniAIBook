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

/** Library entries matching every word typed, in their title, format or style (not the date). */
export function filterLibrary<T extends { title: string; type: string; style?: string | null }>(
  artifacts: T[],
  query: string
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return artifacts;
  return artifacts.filter((a) => {
    const haystack = [
      a.title,
      studioLabel(a.type),
      a.type === "infographic" ? infographicStyleLabel(a.style) : undefined,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
