"use client";

import { useEffect, useState } from "react";
import type { Transformation } from "@/lib/types";

type Draft = { id?: string; name: string; description: string; prompt: string };

const EMPTY: Draft = { name: "", description: "", prompt: "" };

/** Browse the built-in transformations and manage your own. */
export default function TransformationsModal({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Transformation[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/transformations");
    if (res.ok) setList(((await res.json()) as { transformations: Transformation[] }).transformations);
  };

  useEffect(() => {
    void load();
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        draft.id ? `/api/transformations/${encodeURIComponent(draft.id)}` : "/api/transformations",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: Transformation) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    await fetch(`/api/transformations/${encodeURIComponent(t.id)}`, { method: "DELETE" });
    await load();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="fade-up flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex-1">
            <h2 className="text-[15px] font-semibold">Transformations</h2>
            <p className="text-[11px] text-[var(--muted)]">
              Reusable prompts. Open any source and apply one; the result is saved as a note.
            </p>
          </div>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {draft ? (
            <div className="space-y-3">
              <input
                className="input"
                placeholder="Name, e.g. Extract methodology"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <input
                className="input"
                placeholder="Short description (optional)"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <textarea
                className="input min-h-[12rem] resize-y text-[13px] leading-relaxed"
                placeholder="Instruction for the model, e.g. List every dataset the source uses and how it was collected."
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
              {error && <p className="text-[12px] text-red-300">{error}</p>}
              <div className="flex justify-end gap-2">
                <button className="btn !text-[12px]" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary !text-[12px]"
                  disabled={busy || !draft.name.trim() || !draft.prompt.trim()}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : !list ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {list.map((t) => (
                <li key={t.id} className="card flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{t.name}</span>
                      {t.builtin && (
                        <span className="rounded bg-[#1e2430] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                          built-in
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">{t.description || t.prompt}</p>
                  </div>
                  {!t.builtin && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="btn !px-2 !py-1 !text-[11px]"
                        onClick={() =>
                          setDraft({ id: t.id, name: t.name, description: t.description, prompt: t.prompt })
                        }
                      >
                        Edit
                      </button>
                      <button className="btn !px-2 !py-1 !text-[11px]" onClick={() => void remove(t)}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!draft && (
          <footer className="flex shrink-0 justify-end border-t border-[var(--border)] px-5 py-3">
            <button className="btn btn-primary !text-[12px]" onClick={() => setDraft({ ...EMPTY })}>
              ＋ New transformation
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
