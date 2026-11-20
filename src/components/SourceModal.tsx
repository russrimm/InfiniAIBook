"use client";

import { useEffect, useRef, useState } from "react";
import type { Note, Transformation } from "@/lib/types";
import { findMatches, findPassage } from "@/lib/highlight";
import { isExplorable } from "@/lib/explorekinds";
import LoadingRows from "./LoadingRows";
import { useDialog } from "./useDialog";
import DataExplorerModal from "./DataExplorerModal";
import GenerationModal from "./GenerationModal";
import { readJSONReply } from "@/lib/jsonreply";

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

/** The text with every match marked, and the current one flagged for scrolling. */
function renderMatches(text: string, ranges: [number, number][], current: number) {
  const out: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    out.push(text.slice(at, start));
    out.push(
      <mark
        key={start}
        className={i === current ? "find-match find-current" : "find-match"}
        {...(i === current ? { "data-find-current": "" } : {})}
      >
        {text.slice(start, end)}
      </mark>
    );
    at = end;
  });
  out.push(text.slice(at));
  return out;
}

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
  const [statusOpen, setStatusOpen] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [exploring, setExploring] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const contentRef = useRef<HTMLDivElement | null>(null);

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
    setStatusOpen(true);
    setGenerationStatus("Sending transformation request");
    setApplyError(null);
    try {
      const res = await fetch("/api/transformations/apply", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/x-ndjson" },
        body: JSON.stringify({ transformationId: chosen, sourceId }),
      });
      const j = await readJSONReply<{ note?: Note; error?: string }>(
        res, "The transformation failed.", setGenerationStatus,
      );
      if (!j.note) throw new Error("The transformation did not return a note.");
      onNoteCreated?.(j.note);
      setStatusOpen(false);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "The transformation failed.");
    } finally {
      setApplying(false);
    }
  };

  // This can open above another modal (a citation clicked inside an artifact);
  // the dialog stack makes Escape close only this one.
  const { dialogRef, backdropProps } = useDialog(onClose);

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

  const found = src && query.trim() ? findMatches(src.text, query) : null;
  const matchCount = found?.ranges.length ?? 0;
  const step = (by: 1 | -1) => {
    if (!matchCount) return;
    setCurrent((c) => (c + by + matchCount) % matchCount);
  };
  // Bring the current match into view whenever it, or the search, changes.
  useEffect(() => {
    contentRef.current
      ?.querySelector<HTMLElement>("[data-find-current]")
      ?.scrollIntoView({ block: "center" });
  }, [current, query, src]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      {...backdropProps}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-title"
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] outline-none sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="source-title" className="truncate text-[15px] font-semibold">
              {src?.title ?? (loadError ? "Source unavailable" : "Opening source…")}
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
          {src && isExplorable(src.kind) && (
            <button
              className="btn !px-2.5 !py-1.5 !text-xs"
              onClick={() => setExploring(true)}
              title="Discover the structure of this data"
            >
              Explore structure
            </button>
          )}
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

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
              disabled={!chosen}
              onClick={() => applying ? setStatusOpen(true) : void apply()}
              aria-label={applying ? "View transformation generation status" : undefined}
              title="Run on this source and save the result as a note"
            >
              {applying ? "Working…" : "Apply → note"}
            </button>
            {applyError && <p className="w-full text-[12px] text-red-300">{applyError}</p>}
          </div>
        )}

        {src?.summary && (
          <div className="shrink-0 border-b border-[var(--border)] bg-well px-5 py-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {src.summary}
          </div>
        )}

        {src && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-2">
            <label htmlFor="source-find" className="text-[11px] text-[var(--muted)]">
              Find
            </label>
            <input
              id="source-find"
              type="search"
              className="input !h-8 !w-auto min-w-0 flex-1 !py-0 text-[13px]"
              placeholder="Find in this source"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrent(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  step(e.shiftKey ? -1 : 1);
                } else if (e.key === "Escape" && query) {
                  // The first Escape clears the search; the next one closes the dialog.
                  e.preventDefault();
                  setQuery("");
                }
              }}
            />
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px]"
              aria-label="Previous match"
              disabled={matchCount === 0}
              onClick={() => step(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px]"
              aria-label="Next match"
              disabled={matchCount === 0}
              onClick={() => step(1)}
            >
              ↓
            </button>
            <span role="status" className="min-w-[5.5rem] text-[11px] text-[var(--muted)]">
              {!query.trim()
                ? ""
                : matchCount === 0
                  ? "No matches"
                  : `${current + 1} of ${matchCount}${found?.capped ? "+" : ""}`}
            </span>
          </div>
        )}

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loadError && (
            <p className="text-[13px] text-[var(--muted)]">{loadError}</p>
          )}
          {!src && !loadError && <LoadingRows rows={5} label="Loading source" />}
          {cited && (
            <div className="mb-4 rounded-xl border border-line-strong bg-sunk px-4 py-3">
              <p className="mb-1 text-[11px] font-medium text-[var(--muted)]">
                Cited passage · part {highlight?.part} (its exact place in the current text
                could not be found)
              </p>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-prose-soft">
                {cited}
              </p>
            </div>
          )}
          <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-prose-soft">
            {src && found && found.ranges.length > 0 ? (
              renderMatches(src.text, found.ranges, current)
            ) : src && range ? (
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
      {exploring && src && (
        <DataExplorerModal sourceId={sourceId} title={src.title} onClose={() => setExploring(false)} />
      )}
      {statusOpen && (applying || applyError) && (
        <GenerationModal
          jobs={[{
            id: sourceId,
            label: transformations.find((t) => t.id === chosen)?.name ?? "Source transformation",
            status: generationStatus,
            error: applyError ?? undefined,
          }]}
          onClose={() => setStatusOpen(false)}
        />
      )}
    </div>
  );
}
