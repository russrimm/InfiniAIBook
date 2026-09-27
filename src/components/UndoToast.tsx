"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** How long a delete can be taken back before it is sent. */
export const UNDO_MS = 8000;

export type DeferredDelete = {
  /** What the toast calls the item, e.g. `Source "Plants"`. */
  label: string;
  /** The request that actually deletes it. */
  url: string;
  /** Restore whatever was hidden optimistically. */
  onUndo: () => void;
  /** After the delete has gone through (or failed). */
  onCommitted?: (ok: boolean) => void;
};

type Pending = DeferredDelete & { id: number; timer: ReturnType<typeof setTimeout> };

const UndoContext = createContext<((d: DeferredDelete) => void) | null>(null);

/**
 * Deletes wait here before they are sent, so a slip of the hand is one click to
 * reverse instead of a permanent loss. The item is hidden straight away; the
 * DELETE goes out when the window lapses — or immediately, with `keepalive`,
 * if the page is closed first, so leaving never silently cancels a delete.
 */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const seq = useRef(0);

  const sync = (next: Pending[]) => {
    pendingRef.current = next;
    setPending(next);
  };

  const commit = useCallback((id: number, keepalive = false) => {
    const item = pendingRef.current.find((p) => p.id === id);
    if (!item) return;
    clearTimeout(item.timer);
    sync(pendingRef.current.filter((p) => p.id !== id));
    void fetch(item.url, { method: "DELETE", keepalive })
      .then((r) => item.onCommitted?.(r.ok))
      .catch(() => item.onCommitted?.(false));
  }, []);

  const schedule = useCallback(
    (d: DeferredDelete) => {
      const id = ++seq.current;
      const timer = setTimeout(() => commit(id), UNDO_MS);
      sync([...pendingRef.current, { ...d, id, timer }]);
    },
    [commit]
  );

  const undo = (id: number) => {
    const item = pendingRef.current.find((p) => p.id === id);
    if (!item) return;
    clearTimeout(item.timer);
    sync(pendingRef.current.filter((p) => p.id !== id));
    item.onUndo();
  };

  useEffect(() => {
    const flush = () => {
      for (const p of [...pendingRef.current]) commit(p.id, true);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      // Navigating within the app unmounts this too; the delete still stands.
      flush();
    };
  }, [commit]);

  const latest = pending[pending.length - 1];

  return (
    <UndoContext.Provider value={schedule}>
      {children}
      {latest && (
        <div
          role="status"
          className="fade-up fixed bottom-4 left-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--panel)] py-2 pr-2 pl-4 shadow-xl"
        >
          <span className="max-w-[22rem] truncate text-[12px]">
            {latest.label} deleted
            {pending.length > 1 && (
              <span className="text-[var(--muted)]"> (+{pending.length - 1} more)</span>
            )}
          </span>
          <button className="btn btn-primary !py-1 !text-[11px]" onClick={() => undo(latest.id)}>
            Undo
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useDeferredDelete() {
  const schedule = useContext(UndoContext);
  if (!schedule) throw new Error("useDeferredDelete must be used inside <UndoProvider>");
  return schedule;
}
