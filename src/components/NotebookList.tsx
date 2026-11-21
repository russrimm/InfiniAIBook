"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MAX_TITLE_CHARS } from "@/lib/limits";
import {
  NOTEBOOK_SEARCH_FROM,
  NOTEBOOK_SORTS,
  filterNotebooks,
  isNotebookSort,
  sortNotebooks,
  wasUpdated,
  type ListedNotebook,
  type NotebookSort,
} from "@/lib/notebooklist";

const SORT_KEY = "infiniaibook.notebookSort";

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * The home page's notebooks: search once the list is long, a sort that is
 * remembered, and renaming in place. Deleting stays with the page, which owns
 * the confirmation and the undo window.
 */
export default function NotebookList({
  notebooks,
  onDelete,
  onRenamed,
  onDuplicate,
  duplicatingId = null,
}: {
  notebooks: ListedNotebook[];
  onDelete: (id: string, title: string) => void;
  onRenamed: (id: string, title: string) => void;
  /** Make a copy; the page does the request and refreshes the list. */
  onDuplicate: (id: string, title: string) => void;
  /** The notebook being copied right now, if any. */
  duplicatingId?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NotebookSort>("recent");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SORT_KEY);
      if (isNotebookSort(saved)) setSort(saved);
    } catch {
      // Storage can be blocked; the default order still works.
    }
  }, []);

  const chooseSort = (next: NotebookSort) => {
    setSort(next);
    try {
      window.localStorage.setItem(SORT_KEY, next);
    } catch {
      // The choice just will not persist.
    }
  };

  // The search box only exists for longer lists, so a leftover query must not hide a short one.
  const searchable = notebooks.length >= NOTEBOOK_SEARCH_FROM;
  const needle = searchable ? query.trim() : "";
  const shown = sortNotebooks(filterNotebooks(notebooks, needle), sort);

  const startRename = (n: ListedNotebook) => {
    setEditingId(n.id);
    setDraft(n.title);
    setRenameError(null);
  };
  const stopRename = () => {
    const id = editingId;
    setEditingId(null);
    setRenameError(null);
    // Hand focus back to the card's rename button so keyboard users keep their place.
    setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>(`[data-rename="${id}"]`)?.focus();
    }, 0);
  };
  const saveRename = async (n: ListedNotebook) => {
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title) {
      setRenameError("Give the notebook a name.");
      return;
    }
    if (title === n.title) {
      stopRename();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/notebooks/${n.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not rename this notebook. Try again.");
      onRenamed(n.id, title);
      stopRename();
    } catch (e) {
      setRenameError(e instanceof Error && e.message ? e.message : "Could not rename this notebook. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="nb-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="nb-heading" className="text-sm font-medium text-[var(--muted)]">
          Your notebooks · {needle ? `${shown.length} of ${notebooks.length}` : notebooks.length}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          {searchable && (
            // .input is full width, so the width is set on the wrapper.
            <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
              <input
                type="search"
                className="input !py-1.5 text-[13px]"
                placeholder="Search notebooks"
                aria-label="Search notebooks"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {notebooks.length > 1 && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
              <label htmlFor="notebook-sort">Sort</label>
              <select
                id="notebook-sort"
                className="input !w-auto !py-1.5 text-[13px]"
                value={sort}
                onChange={(e) => chooseSort(e.target.value as NotebookSort)}
              >
                {NOTEBOOK_SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm text-[var(--muted)]">
            No notebook matches “{needle}”. Clear the search to see all {notebooks.length}.
          </p>
          <button type="button" className="btn" onClick={() => setQuery("")}>
            Clear search
          </button>
        </div>
      ) : (
        <ul ref={listRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <li
              key={n.id}
              className="card fade-up group relative p-5 transition focus-within:border-line-hover hover:border-line-hover"
            >
              <div aria-hidden className="mb-4 text-3xl">
                {n.emoji}
              </div>
              {editingId === n.id ? (
                <form
                  className="relative z-10"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!saving) void saveRename(n);
                  }}
                >
                  <label className="sr-only" htmlFor={`rename-nb-${n.id}`}>
                    Notebook name
                  </label>
                  <input
                    id={`rename-nb-${n.id}`}
                    className="input w-full !py-1.5 text-sm"
                    value={draft}
                    maxLength={MAX_TITLE_CHARS}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Escape") return;
                      e.preventDefault();
                      e.stopPropagation();
                      stopRename();
                    }}
                  />
                  {renameError && (
                    <p role="alert" className="mt-1.5 text-[11px] text-red-300">
                      {renameError}
                    </p>
                  )}
                  <div className="mt-2 flex gap-1.5">
                    <button type="submit" className="btn btn-primary !px-2.5 !py-1 !text-xs" disabled={saving}>
                      {saving ? "Saving…" : "Save name"}
                    </button>
                    <button type="button" className="btn !px-2.5 !py-1 !text-xs" onClick={stopRename}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <h3 className="mb-1 line-clamp-2 pr-32 font-medium">
                  {/* The link's overlay makes the whole card the target, while the
                    rename and delete buttons stay separate controls rather than nested. */}
                  <Link
                    href={`/notebook/${n.id}`}
                    className="rounded outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--accent)]"
                  >
                    {n.title}
                  </Link>
                </h3>
              )}
              <p className="text-xs text-[var(--muted)]">
                {n.sourceCount ?? 0} source{n.sourceCount === 1 ? "" : "s"} · Created {shortDate(n.createdAt)}
                {wasUpdated(n) && <> · Updated {shortDate(n.lastActivity ?? n.createdAt)}</>}
              </p>
              {editingId !== n.id && (
                <button
                  type="button"
                  aria-label={`Rename notebook ${n.title}`}
                  title="Rename notebook"
                  data-rename={n.id}
                  className="absolute top-3 right-[84px] z-10 flex size-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
                  onClick={() => startRename(n)}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
              {editingId !== n.id && (
                <button
                  type="button"
                  aria-label={`Duplicate notebook ${n.title}`}
                  title={duplicatingId === n.id ? "Duplicating…" : "Duplicate notebook"}
                  aria-busy={duplicatingId === n.id}
                  disabled={duplicatingId !== null}
                  className="absolute top-3 right-12 z-10 flex size-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)] disabled:opacity-50"
                  onClick={() => onDuplicate(n.id, n.title)}
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={duplicatingId === n.id ? "animate-pulse" : undefined}
                  >
                    <rect x="9" y="9" width="12" height="12" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete notebook ${n.title}`}
                title="Delete notebook"
                className="absolute top-3 right-3 z-10 flex size-9 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-hover hover:text-red-400"
                onClick={() => onDelete(n.id, n.title)}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
