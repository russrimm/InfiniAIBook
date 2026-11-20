import { useEffect, useState } from "react";
import { studioIcon } from "@/lib/studio";
import {
  LIBRARY_SORTS,
  filterLibrary,
  isLibrarySort,
  libraryMeta,
  sortLibrary,
  type LibrarySort,
} from "@/lib/librarymeta";
import type { ArtifactSummary } from "@/lib/types";

/** A Library filter box earns its space once the list is too long to scan. */
export const LIBRARY_FILTER_FROM = 6;

/** The filter and sort state lives with the panel so it survives switching views. */
export function useLibraryControls(artifacts: ArtifactSummary[]) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("newest");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("infiniaibook.librarySort");
      if (isLibrarySort(saved)) setLibrarySort(saved);
    } catch {
      // Storage can be blocked; the default order still works.
    }
  }, []);
  const chooseSort = (sort: LibrarySort) => {
    setLibrarySort(sort);
    try {
      window.localStorage.setItem("infiniaibook.librarySort", sort);
    } catch {
      // The choice just will not persist.
    }
  };
  const shownArtifacts = sortLibrary(filterLibrary(artifacts, libraryQuery), librarySort);
  return { libraryQuery, setLibraryQuery, librarySort, chooseSort, shownArtifacts };
}

export type LibraryControls = ReturnType<typeof useLibraryControls>;

export default function StudioLibrary({
  artifacts,
  controls,
  openingId,
  onOpen,
  onRemove,
  onCreate,
}: {
  artifacts: ArtifactSummary[];
  controls: LibraryControls;
  openingId: string | null;
  onOpen: (a: ArtifactSummary) => void;
  onRemove: (a: ArtifactSummary) => void;
  onCreate: () => void;
}) {
  const { libraryQuery, setLibraryQuery, librarySort, chooseSort, shownArtifacts } = controls;
  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      {artifacts.length === 0 ? (
        <div className="card px-4 py-6 text-center text-[11px] leading-relaxed text-[var(--muted)]">
          Nothing generated yet.
          <div className="mt-3">
            <button
              className="btn !px-2.5 !py-1 !text-[11px]"
              onClick={() => onCreate()}
            >
              Choose a format to create
            </button>
          </div>
        </div>
      ) : (
        <>
          {artifacts.length > 1 && (
            <div className="sticky top-0 z-10 mb-1 bg-[var(--panel)] pb-2 pt-1">
              {artifacts.length >= LIBRARY_FILTER_FROM && (
                <input
                  type="search"
                  className="input w-full !py-1.5 text-[13px]"
                  placeholder="Filter by name, format or style"
                  aria-label="Filter Library"
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                />
              )}
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                <label htmlFor="library-sort">Sort</label>
                <select
                  id="library-sort"
                  className="input min-w-0 flex-1 !py-1 text-[12px]"
                  value={librarySort}
                  onChange={(e) => chooseSort(e.target.value as LibrarySort)}
                >
                  {LIBRARY_SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              {artifacts.length >= LIBRARY_FILTER_FROM && libraryQuery.trim() && (
                <p role="status" className="mt-1 text-[11px] text-[var(--muted)]">
                  Showing {shownArtifacts.length} of {artifacts.length}.
                </p>
              )}
            </div>
          )}
        <ul className="space-y-1">
          {shownArtifacts.map((a) => (
            <li
              key={a.id}
              className="group flex items-center gap-2 rounded-xl border border-transparent px-2 py-2 transition hover:border-[var(--border)] hover:bg-panel2"
            >
              <span aria-hidden className="text-base">
                {studioIcon(a.type)}
              </span>
              <button
                className="min-w-0 flex-1 text-left disabled:opacity-60"
                onClick={() => onOpen(a)}
                disabled={openingId === a.id}
                title={`${a.title} — ${libraryMeta(a)}`}
              >
                <div className="truncate text-[13px] font-medium">
                  {a.title}
                </div>
                <div className="truncate text-[10px] text-dim">
                  {openingId === a.id ? "Opening…" : libraryMeta(a)}
                </div>
              </button>
              <button
                aria-label={`Delete ${a.title}`}
                className="reveal shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-red-400"
                onClick={() => onRemove(a)}
              >
                ✕
              </button>
            </li>
          ))}
          {libraryQuery.trim() && shownArtifacts.length === 0 && (
            <li className="px-2 py-6 text-center text-[11px] text-[var(--muted)]">
              Nothing in the Library matches “{libraryQuery.trim()}”.{" "}
              <button type="button" className="underline" onClick={() => setLibraryQuery("")}>
                Clear filter
              </button>
            </li>
          )}
        </ul>
        </>
      )}
    </div>
  );
}