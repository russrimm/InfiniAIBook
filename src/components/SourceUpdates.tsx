"use client";

import { useEffect, useState } from "react";

export type PendingUpdate = {
  id: string;
  title: string;
  newTitle: string | null;
  url: string;
  detectedAt: number;
  oldChars: number;
  newChars: number;
  addedLines: number;
  removedLines: number;
  charDelta: number;
  samples: { added: string[]; removed: string[] };
};

export default function SourceUpdates({
  updates,
  onResolved,
  onClose,
}: {
  updates: PendingUpdate[];
  /** Called after each decision so the caller can refresh its own view. */
  onResolved: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "applied" | "dismissed">>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /**
   * Resolving a source removes it from the caller's pending list. Rendering
   * that list directly would make the row vanish at the moment of the click,
   * leaving no confirmation of what was just decided, so the modal keeps its
   * own copy until it closes.
   */
  const [rows, setRows] = useState<PendingUpdate[]>(updates);

  useEffect(() => {
    setRows((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      const added = updates.filter((u) => !seen.has(u.id));
      return added.length ? [...prev, ...added] : prev;
    });
  }, [updates]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const decide = async (id: string, action: "apply" | "dismiss") => {
    setWorking(id);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/sources/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update that source.");
      setDone((d) => ({ ...d, [id]: action === "apply" ? "applied" : "dismissed" }));
      if (json.warning) setNote(json.warning);
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that source.");
    } finally {
      setWorking(null);
    }
  };

  const outstanding = rows.filter((u) => !done[u.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <span className="text-lg">🔄</span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">
              {outstanding.length
                ? `${outstanding.length} source${outstanding.length === 1 ? " has" : "s have"} changed`
                : "All changes reviewed"}
            </h2>
            <p className="text-[11px] text-[var(--muted)]">
              Re-indexing replaces what the notebook knows, so nothing is applied
              without your say-so.
            </p>
          </div>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {error && (
            <p className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-[12px] text-red-200">
              {error}
            </p>
          )}
          {note && (
            <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-[12px] text-amber-200/90">
              {note}
            </p>
          )}

          {rows.map((u) => {
            const state = done[u.id];
            return (
              <div
                key={u.id}
                className={`rounded-xl border border-[var(--border)] p-4 transition ${
                  state ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-medium">{u.title}</h3>
                    {u.newTitle && (
                      <p className="mt-0.5 text-[11px] text-amber-200/80">
                        Title now reads “{u.newTitle}”
                      </p>
                    )}
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 block truncate text-[11px] text-[var(--muted)] underline decoration-dotted hover:text-[var(--fg)]"
                    >
                      {u.url}
                    </a>
                  </div>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">
                    {u.oldChars.toLocaleString()} →{" "}
                    <span className={u.charDelta >= 0 ? "text-emerald-300" : "text-amber-300"}>
                      {u.newChars.toLocaleString()}
                    </span>{" "}
                    chars
                  </span>
                </div>

                {(u.samples.added.length > 0 || u.samples.removed.length > 0) && (
                  <div className="mt-3 space-y-1 rounded-lg bg-[#0e1116] p-3 font-mono text-[11px] leading-relaxed">
                    {u.samples.added.map((l, i) => (
                      <p key={`a${i}`} className="text-emerald-300/90">
                        <span className="mr-1.5 opacity-60">+</span>
                        {l}
                      </p>
                    ))}
                    {u.samples.removed.map((l, i) => (
                      <p key={`r${i}`} className="text-red-300/80">
                        <span className="mr-1.5 opacity-60">−</span>
                        {l}
                      </p>
                    ))}
                    <p className="pt-1 font-sans text-[10px] text-[var(--muted)]">
                      {u.addedLines} line{u.addedLines === 1 ? "" : "s"} added ·{" "}
                      {u.removedLines} removed
                      {u.samples.added.length + u.samples.removed.length <
                        u.addedLines + u.removedLines && " · showing the first few"}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  {state ? (
                    <span className="text-[11px] text-[var(--muted)]">
                      {state === "applied" ? "Re-indexed." : "Kept the indexed copy."}
                    </span>
                  ) : (
                    <>
                      <button
                        className="btn !py-1.5 !text-xs"
                        disabled={working === u.id}
                        onClick={() => void decide(u.id, "dismiss")}
                      >
                        Keep current
                      </button>
                      <button
                        className="btn btn-primary !py-1.5 !text-xs"
                        disabled={working === u.id}
                        onClick={() => void decide(u.id, "apply")}
                      >
                        {working === u.id ? "Re-indexing…" : "Re-index"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          <span className="text-[11px] text-[var(--muted)]">
            Re-indexing re-chunks and re-embeds the source.
          </span>
          <div className="ml-auto flex gap-2">
            <button className="btn !py-1.5 !text-xs" onClick={onClose}>
              {outstanding.length ? "Decide later" : "Close"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
