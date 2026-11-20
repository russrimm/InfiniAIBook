import type { DiscoverHit } from "@/components/DiscoverModal";

/** Content types in the order the picker lists them; anything else follows alphabetically. */
const KIND_ORDER = ["Documentation", "Training", "Videos", "Certifications"];

function key(url: string): string {
  return url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/** Append `incoming` pages not already listed, never exceeding `limit`. */
export function appendHits(current: DiscoverHit[], incoming: DiscoverHit[], limit: number): DiscoverHit[] {
  const seen = new Set(current.map((hit) => key(hit.url)));
  const out = [...current];
  for (const hit of incoming) {
    if (out.length >= limit) break;
    if (seen.has(key(hit.url))) continue;
    seen.add(key(hit.url));
    out.push(hit);
  }
  return out;
}

/** Content types present in `hits`, in display order, with how many pages each holds. */
export function kindCounts(hits: DiscoverHit[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    if (hit.kind) counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
  }
  const rank = (kind: string) => {
    const index = KIND_ORDER.indexOf(kind);
    return index === -1 ? KIND_ORDER.length : index;
  };
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind));
}

/** Pages whose title, snippet or URL contains every word typed, optionally limited to one content type. */
export function filterHits(hits: DiscoverHit[], text: string, kind: string | null): DiscoverHit[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return hits.filter((hit) => {
    if (kind && hit.kind !== kind) return false;
    const haystack = `${hit.title} ${hit.snippet} ${hit.url}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Split `hits` into content-type groups, keeping relevance order inside each group. */
export function groupHits(hits: DiscoverHit[]): { kind: string | null; hits: DiscoverHit[] }[] {
  if (!hits.some((hit) => hit.kind)) return hits.length ? [{ kind: null, hits }] : [];
  return kindCounts(hits).map(({ kind }) => ({ kind, hits: hits.filter((hit) => hit.kind === kind) }));
}
