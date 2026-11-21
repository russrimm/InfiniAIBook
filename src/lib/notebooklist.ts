/** A notebook as the home list shows it. */
export type ListedNotebook = {
  id: string;
  title: string;
  emoji: string;
  createdAt: number;
  sourceCount?: number;
  /** Latest of the notebook's creation and anything added to it since. */
  lastActivity?: number;
};

/** A search box earns its space once the list is too long to scan. */
export const NOTEBOOK_SEARCH_FROM = 6;

export type NotebookSort = "recent" | "newest" | "oldest" | "name" | "sources";

export const NOTEBOOK_SORTS: { key: NotebookSort; label: string }[] = [
  { key: "recent", label: "Recently active" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name (A to Z)" },
  { key: "sources", label: "Most sources" },
];

export const isNotebookSort = (v: unknown): v is NotebookSort => NOTEBOOK_SORTS.some((s) => s.key === v);

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** Notebooks whose title contains every word typed, ignoring case. */
export function filterNotebooks<T extends { title: string }>(notebooks: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return notebooks;
  return notebooks.filter((n) => {
    const title = n.title.toLowerCase();
    return words.every((w) => title.includes(w));
  });
}

/**
 * A sorted copy. Ties fall back to newest first and then to the id, so the
 * order never shuffles between renders. Name sort ignores case and reads
 * numbers as numbers ("Week 2" before "Week 10").
 */
export function sortNotebooks<T extends ListedNotebook>(notebooks: T[], sort: NotebookSort): T[] {
  const activity = (n: T) => n.lastActivity ?? n.createdAt;
  const byNewest = (a: T, b: T) => b.createdAt - a.createdAt || compareText(a.id, b.id);
  const order: Record<NotebookSort, (a: T, b: T) => number> = {
    recent: (a, b) => activity(b) - activity(a) || byNewest(a, b),
    newest: byNewest,
    oldest: (a, b) => a.createdAt - b.createdAt || compareText(a.id, b.id),
    name: (a, b) => compareText(a.title, b.title) || byNewest(a, b),
    sources: (a, b) => (b.sourceCount ?? 0) - (a.sourceCount ?? 0) || byNewest(a, b),
  };
  return [...notebooks].sort(order[sort]);
}

/** "Updated" is only worth saying when something happened after the notebook was made. */
export function wasUpdated(n: ListedNotebook): boolean {
  return (n.lastActivity ?? n.createdAt) - n.createdAt > 60_000;
}
