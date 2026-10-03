"use client";

import { useEffect, useMemo, useState } from "react";
import { useDialog } from "./useDialog";

type LibrarySource = {
  id: string;
  title: string;
  kind: string;
  chars: number;
  notebookId: string;
  notebookTitle: string;
  notebookEmoji: string;
};

/**
 * Pick sources from other notebooks to reuse here. They are copied with their
 * embeddings, so adding one is instant and costs no model calls.
 */
export default function LibraryModal({
  notebookId,
  onClose,
  onAdded,
}: {
  notebookId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [all, setAll] = useState<LibrarySource[] | null>(null);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const { dialogRef, backdropProps } = useDialog(onClose);

  useEffect(() => {
    void fetch(`/api/sources?exclude=${encodeURIComponent(notebookId)}`)
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((j: { sources: LibrarySource[] }) => setAll(j.sources))
      .catch(() => setAll([]));
  }, [notebookId]);

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const map = new Map<string, { title: string; emoji: string; items: LibrarySource[] }>();
    for (const s of all ?? []) {
      if (q && !s.title.toLowerCase().includes(q) && !s.notebookTitle.toLowerCase().includes(q)) {
        continue;
      }
      if (!map.has(s.notebookId)) {
        map.set(s.notebookId, { title: s.notebookTitle, emoji: s.notebookEmoji, items: [] });
      }
      map.get(s.notebookId)!.items.push(s);
    }
    return [...map.entries()];
  }, [all, filter]);

  const add = async () => {
    setBusy(true);
    setErrors([]);
    const failed: string[] = [];
    for (const id of picked) {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ copyFrom: id }),
        });
        if (!res.ok) failed.push(((await res.json()) as { error?: string }).error ?? "Copy failed");
      } catch {
        failed.push("Copy failed");
      }
    }
    setBusy(false);
    onAdded();
    if (failed.length) setErrors(failed);
    else onClose();
  };

  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        className="fade-up flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] outline-none"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex-1">
            <h2 id="library-title" className="text-[15px] font-semibold">
              Add from your library
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Reuse sources from other notebooks without uploading or re-indexing them.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="shrink-0 px-5 pt-3">
          <input
            className="input"
            placeholder="Filter by source or notebook…"
            aria-label="Filter sources"
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {!all ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {all.length ? "Nothing matches." : "Your other notebooks have no sources yet."}
            </p>
          ) : (
            groups.map(([id, g]) => (
              <div key={id} className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                  {g.emoji} {g.title}
                </h3>
                <ul className="space-y-1">
                  {g.items.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-[#161a21]">
                        <input
                          type="checkbox"
                          checked={picked.has(s.id)}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span className="shrink-0 text-[10px] text-dim">{s.kind}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {errors.map((e, i) => (
            <p key={i} role="alert" className="text-[12px] text-red-300">
              {e}
            </p>
          ))}
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button className="btn !text-[12px]" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary !text-[12px]"
            disabled={busy || picked.size === 0}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : `Add ${picked.size || ""}`.trim()}
          </button>
        </footer>
      </div>
    </div>
  );
}
