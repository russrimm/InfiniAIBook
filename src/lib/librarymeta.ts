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

export type LibrarySort = "newest" | "oldest" | "name" | "type";

export const LIBRARY_SORTS: { key: LibrarySort; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name (A to Z)" },
  { key: "type", label: "Format (A to Z)" },
];

export const isLibrarySort = (v: unknown): v is LibrarySort => LIBRARY_SORTS.some((s) => s.key === v);

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/**
 * A sorted copy of the Library. Name and format sorts ignore case and read
 * numbers as numbers ("Quiz 2" before "Quiz 10"); ties fall back to newest
 * first, so the order never shuffles between renders.
 */
export function sortLibrary<T extends { title: string; type: string; createdAt: number }>(artifacts: T[], sort: LibrarySort): T[] {
  const newest = (a: T, b: T) => b.createdAt - a.createdAt;
  const order: Record<LibrarySort, (a: T, b: T) => number> = {
    newest,
    oldest: (a, b) => a.createdAt - b.createdAt,
    name: (a, b) => compareText(a.title, b.title) || newest(a, b),
    type: (a, b) => compareText(studioLabel(a.type), studioLabel(b.type)) || newest(a, b),
  };
  return [...artifacts].sort(order[sort] ?? newest);
}