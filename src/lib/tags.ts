/**
 * Tags on sources. A tag works as a folder: give related sources the same tag
 * ("Interviews", "2024 filings") and filter the list down to it. A source can
 * carry several, so one source can sit in several "folders" at once.
 *
 * Stored as a JSON array in sources.tags (NULL when there are none), so older
 * databases and exports without the column keep working.
 */

export const MAX_TAGS = 8;
export const MAX_TAG_CHARS = 32;

/** One tag as typed: whitespace collapsed, no commas or control characters, at most 32 characters. */
export function normalizeTag(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[,\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_CHARS)
    .trim();
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A list (or a comma-separated string) cleaned up: no blanks, no duplicates ignoring case, at most 8. */
export function normalizeTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const out: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item);
    if (tag && !out.some((t) => same(t, tag))) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    return normalizeTags(JSON.parse(json));
  } catch {
    return [];
  }
}

export const serializeTags = (tags: string[]): string | null => (tags.length ? JSON.stringify(normalizeTags(tags)) : null);

export const hasTag = (tags: string[], tag: string): boolean => tags.some((t) => same(t, tag));

/** `tags` with `tag` added; unchanged when it is already there or the source already has 8. */
export function withTag(tags: string[], tag: string): string[] {
  const clean = normalizeTag(tag);
  if (!clean || hasTag(tags, clean) || tags.length >= MAX_TAGS) return tags;
  return [...tags, clean];
}

export function withoutTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => !same(t, tag));
}

/** Every tag in use with how many sources carry it, alphabetical ignoring case. */
export function tagCounts(sources: { tags?: string[] }[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const s of sources) {
    for (const tag of s.tags ?? []) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
}
