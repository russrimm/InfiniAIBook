"use client";

import { useEffect, useRef, useState } from "react";
import type { Note, Transformation } from "@/lib/types";
import { findPassage } from "@/lib/highlight";

type Full = {
  id: string;
  title: string;
  kind: string;
  url: string | null;
  text: string;
  chars: number;
  summary: string | null;
  passage?: string | null;
};

/** A citation to show in place: which part, and the excerpt it quoted. */
export type SourceHighlight = { part: number; snippet?: string };

export default function SourceModal({
  sourceId,
  highlight,
  onClose,
  onNoteCreated,
}: {
  sourceId: string;
  highlight?: SourceHighlight | null;
  onClose: () => void;
  /** Called with the note a transformation produced. */
  onNoteCreated?: (note: Note) => void;
}) {
  const [src, setSrc] = useState<Full | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const markRef = useRef<HTMLElement | null>(null);
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
    // Captured and stopped: this can open above another modal (a citation
    // clicked inside an artifact), and Escape should close only this one.
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);

  const part = highlight?.part;
  useEffect(() => {
    let live = true;
    setSrc(null);
    setLoadError(null);
    const qs = part ? `?part=${part}` : "";
    void fetch(`/api/sources/${sourceId}${qs}`)
      .then(async (r) => {
        if (!live) return;
        if (r.status === 404) {
          setLoadError("This source has been removed from the notebook.");
          return;
        }
        if (!r.ok) throw new Error();
        setSrc((await r.json()) as Full);
      })
      .catch(() => live && setLoadError("This source could not be loaded."));
    return () => {
      live = false;
    };
  }, [sourceId, part]);

  // Prefer the stored chunk; the citation's snippet is only its first 320
  // characters, but locates the passage just as well when the chunk is gone.
  const range =
    src && highlight ? findPassage(src.text, src.passage || highlight.snippet || "") : null;
  const cited = highlight && src && !range ? src.passage || highlight.snippet : null;

  const rangeStart = range?.[0];
  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, [rangeStart, src]);

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
              {src?.title ?? (loadError ? "Source unavailable" : "Loading…")}
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
          {loadError && (
            <p className="text-[13px] text-[var(--muted)]">{loadError}</p>
          )}
          {cited && (
            <div className="mb-4 rounded-xl border border-[#2f3846] bg-[#141922] px-4 py-3">
              <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">
                Cited passage · part {highlight?.part} (its exact place in the current text
                could not be found)
              </p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
                {cited}
              </p>
            </div>
          )}
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
            {src && range ? (
              <>
                {src.text.slice(0, range[0])}
                <mark
                  ref={markRef}
                  className="cited-passage"
                  aria-label={`Cited passage, part ${highlight?.part}`}
                >
                  {src.text.slice(range[0], range[1])}
                </mark>
                {src.text.slice(range[1])}
              </>
            ) : (
              (src?.text ?? "")
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
