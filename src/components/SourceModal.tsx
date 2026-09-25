"use client";

import { useEffect, useState } from "react";
import type { Note, Transformation } from "@/lib/types";

type Full = {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  text: string;
  chars: number;
  summary: string | null;
};

export default function SourceModal({
  sourceId,
  onClose,
  onNoteCreated,
}: {
  sourceId: string;
  onClose: () => void;
  /** Called with the note a transformation produced. */
  onNoteCreated?: (note: Note) => void;
}) {
  const [src, setSrc] = useState<Full | null>(null);
  const [transformations, setTransformations] = useState<Transformation[]>([]);
  const [chosen, setChosen] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/transformations")
      .then((r) => (r.ok ? r.json() : { transformations: [] }))
      .then((j: { transformations: Transformation[] }) => {
        setTransformations(j.transformations);
        setChosen((c) => c || j.transformations[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  const apply = async () => {
    if (!chosen) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/transformations/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transformationId: chosen, sourceId }),
      });
      const j = (await res.json()) as { note?: Note; error?: string };
      if (!res.ok || !j.note) throw new Error(j.error || "The transformation failed.");
      onNoteCreated?.(j.note);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "The transformation failed.");
    } finally {
      setApplying(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    void fetch(`/api/sources/${sourceId}`)
      .then((r) => r.json())
      .then(setSrc);
    return () => window.removeEventListener("keydown", h);
  }, [sourceId, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">
              {src?.title ?? "Loading…"}
            </h2>
            {src && (
              <p className="text-[11px] text-[var(--muted)]">
                {src.kind.toUpperCase()} · {src.chars.toLocaleString()} characters
                {src.url && (
                  <>
                    {" · "}
                    <a
                      className="underline hover:text-[var(--fg)]"
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      original
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {src && transformations.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-2.5">
            <span className="text-[11px] text-[var(--muted)]">Transform</span>
            <select
              aria-label="Transformation"
              className="input !h-8 !w-auto min-w-0 flex-1 !py-0 text-[12px]"
              value={chosen}
              disabled={applying}
              onChange={(e) => setChosen(e.target.value)}
            >
              {transformations.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary !px-3 !py-1 !text-[12px]"
              disabled={applying || !chosen}
              onClick={() => void apply()}
              title="Run on this source and save the result as a note"
            >
              {applying ? "Working…" : "Apply → note"}
            </button>
            {applyError && <p className="w-full text-[12px] text-red-300">{applyError}</p>}
          </div>
        )}

        {src?.summary && (
          <div className="shrink-0 border-b border-[var(--border)] bg-[#0e1116] px-5 py-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {src.summary}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
            {src?.text ?? ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
