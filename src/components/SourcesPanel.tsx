"use client";

import { useEffect, useRef, useState } from "react";
import type { Source } from "@/lib/types";
import type { DiscoverHit } from "./DiscoverModal";

const ICONS: Record<string, string> = {
  pdf: "📕",
  docx: "📘",
  url: "🌐",
  html: "🌐",
  youtube: "📺",
  "youtube-description": "📺",
  text: "📝",
  md: "📝",
  txt: "📄",
  csv: "📊",
  json: "🔧",
  note: "🗒️",
  audio: "🎧",
  video: "🎬",
  mp3: "🎧",
  mpga: "🎧",
  mpeg: "🎧",
  m4a: "🎧",
  wav: "🎧",
  ogg: "🎧",
  oga: "🎧",
  flac: "🎧",
  webm: "🎬",
  mp4: "🎬",
};

/** Mirrors the media types the server transcribes (src/lib/ingest.ts). */
const MEDIA_ACCEPT = ".mp3,.mpga,.mpeg,.m4a,.wav,.ogg,.oga,.flac,.webm,.mp4";

function bytes(n: number) {
  if (n < 1000) return `${n} chars`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${(n / 1_000_000).toFixed(1)}M chars`;
}

function iconFor(name: string, fallback = "📄") {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ICONS[ext] ?? fallback;
}

/** An upload waiting for, or being processed on, the server. */
type Job = {
  id: string;
  label: string;
  icon: string;
  queued?: boolean;
  error?: string;
};

let jobSeq = 0;

/**
 * Uploads run a few at a time. Dropping twenty files used to start twenty
 * ingests at once — twenty PDFs parsed together and twenty bursts of
 * embedding calls, which is how a provider's rate limit got tripped.
 */
const CONCURRENT_UPLOADS = 3;

function formatMb(n: number) {
  return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
}

export default function SourcesPanel({
  notebookId,
  sources,
  maxUploadBytes,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onOpen,
  onRemove,
  onChanged,
  onDiscover,
  onBrowse,
  onLibrary,
  addRef,
  headerActions,
}: {
  notebookId: string;
  sources: Source[];
  /** Server's upload limit, so oversized files are refused before sending. */
  maxUploadBytes?: number;
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  /** Delete with an undo window; the panel only asks. */
  onRemove: (s: Source) => void;
  onChanged: () => Promise<void> | void;
  onDiscover: () => void;
  onBrowse: () => void;
  /** Reuse a source that already lives in another notebook. */
  onLibrary: () => void;
  addRef: React.MutableRefObject<((hits: DiscoverHit[]) => void) | null>;
  /** Panel chrome (pin, collapse) shown beside the heading. */
  headerActions?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mode, setMode] = useState<"none" | "url" | "text">("none");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [dragging, setDragging] = useState(false);

  /**
   * Each source is ingested by its own request, so slow items (a large PDF, a
   * page fetch, embedding a long transcript) never block the others. Requests
   * run CONCURRENT_UPLOADS at a time; the rest show as queued.
   */
  const queue = useRef<(() => Promise<void>)[]>([]);
  const running = useRef(0);
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (summaryTimer.current) clearTimeout(summaryTimer.current);
    },
    []
  );

  const pump = () => {
    while (running.current < CONCURRENT_UPLOADS && queue.current.length) {
      const next = queue.current.shift()!;
      running.current++;
      void next().finally(() => {
        running.current--;
        pump();
      });
    }
  };

  /** Summaries are written just after a source is added; show them when ready. */
  const refreshForSummaries = () => {
    if (summaryTimer.current) clearTimeout(summaryTimer.current);
    summaryTimer.current = setTimeout(() => void onChanged(), 8000);
  };

  const startJob = (label: string, icon: string, init: RequestInit) => {
    const id = `job-${++jobSeq}`;
    setJobs((prev) => [...prev, { id, label, icon, queued: true }]);

    queue.current.push(async () => {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, queued: false } : j)));
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
          method: "POST",
          ...init,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not add this source");

        const warning: string | undefined = json.warnings?.[0];
        const failure: string | undefined = json.errors?.[0];
        if (failure) throw new Error(failure);

        await onChanged();
        refreshForSummaries();
        setJobs((prev) => prev.filter((j) => j.id !== id));
        if (warning) {
          // Not fatal, but the user should know the source is degraded.
          setJobs((prev) => [
            ...prev,
            { id: `${id}-warn`, label, icon: "⚠️", error: warning },
          ]);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not add this source";
        setJobs((prev) =>
          prev.map((j) => (j.id === id ? { ...j, error: message } : j))
        );
      }
    });
    pump();
  };

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (maxUploadBytes && file.size > maxUploadBytes) {
        setJobs((prev) => [
          ...prev,
          {
            id: `job-${++jobSeq}`,
            label: file.name,
            icon: iconFor(file.name),
            error: `${formatMb(file.size)} is over the ${formatMb(maxUploadBytes)} upload limit.`,
          },
        ]);
        continue;
      }
      const fd = new FormData();
      fd.append("files", file);
      startJob(file.name, iconFor(file.name), { body: fd });
    }
  };

  const addUrl = (url: string, title?: string) => {
    const label =
      title ??
      (() => {
        try {
          const u = new URL(url);
          return u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
        } catch {
          return url;
        }
      })();
    return startJob(label.slice(0, 90), /youtu\.?be/i.test(url) ? "📺" : "🌐", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, title }),
    });
  };

  // Lets the Discover modal queue its selections through the same pipeline.
  useEffect(() => {
    addRef.current = (hits: DiscoverHit[]) =>
      hits.forEach((h) => addUrl(h.url, h.title));
    return () => {
      addRef.current = null;
    };
  });

  const dismissJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id));

  const active = jobs.filter((j) => !j.error);

  return (
    <aside
      aria-labelledby="sources-heading"
      className="flex h-full min-h-0 flex-col bg-[var(--panel)]"
    >
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <h2 id="sources-heading" className="flex-1 text-sm font-semibold tracking-wide">
            Sources
          </h2>
          {sources.length > 0 && (
            <button
              className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
              onClick={onToggleAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
          {headerActions}
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {sources.length > 0
            ? "Ticked sources are the only ones Chat and Studio use. Click a source to read it."
            : "Add what you want to research. Chat and Studio use only these."}
        </p>
      </div>

      <div className="px-4 pb-3" data-tour="add-sources">
        <button
          type="button"
          id="add-sources"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileRef.current?.click()}
          className={`block w-full cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition ${
            dragging
              ? "border-[var(--accent)] bg-[rgba(124,140,255,0.06)]"
              : "border-[var(--border)] hover:border-line-hover hover:bg-[#161a21]"
          }`}
        >
          <span aria-hidden className="mb-1 block text-lg">
            📎
          </span>
          <span className="block text-xs font-medium">Drop files or click to upload</span>
          <span className="mt-1 block text-[11px] text-[var(--muted)]">
            PDF · DOCX · TXT · MD · CSV · HTML · audio/video (transcribed)
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={`.pdf,.docx,.txt,.md,.csv,.json,.html,.htm,${MEDIA_ACCEPT}`}
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "url" ? "none" : "url")}
            aria-expanded={mode === "url"}
            title="Add a web page or YouTube link"
          >
            <span aria-hidden>🔗</span> Add link
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "text" ? "none" : "text")}
            aria-expanded={mode === "text"}
            title="Paste text as a source"
          >
            <span aria-hidden>📝</span> Paste text
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={onDiscover}
            title="Search the web for sources on a topic and pick which to add"
          >
            <span aria-hidden>🔎</span> Search web
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={onBrowse}
            title="Browse the web in the app and add pages as you go"
          >
            <span aria-hidden>🌐</span> Browse web
          </button>
          <button
            className="btn col-span-2 !px-2 !py-1.5 !text-xs"
            onClick={onLibrary}
            title="Reuse a source that is already in another notebook"
          >
            <span aria-hidden>📚</span> From other notebooks
          </button>
        </div>

        {mode === "url" && (
          <form
            className="fade-up mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = urlValue.trim();
              if (!v) return;
              addUrl(v);
              setUrlValue("");
              setMode("none");
            }}
          >
            <input
              className="input"
              inputMode="url"
              placeholder="https://example.com or a YouTube link"
              aria-label="Link to add"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary !px-3">Add</button>
          </form>
        )}

        {mode === "text" && (
          <form
            className="fade-up mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!textValue.trim()) return;
              const title = textTitle.trim() || "Pasted text";
              startJob(title, "📝", {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ text: textValue, title }),
              });
              setTextValue("");
              setTextTitle("");
              setMode("none");
            }}
          >
            <input
              className="input"
              placeholder="Title (optional)"
              aria-label="Title (optional)"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
            />
            <textarea
              className="input h-28 resize-none"
              placeholder="Paste your text here…"
              aria-label="Text to add"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary w-full">Add source</button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {jobs.length === 0 && sources.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
            No sources yet. Everything you ask and generate is grounded in what you add
            here.
          </p>
        ) : (
          <ul className="space-y-1">
            {jobs.map((job) => (
              <li
                key={job.id}
                className={`fade-up flex gap-2.5 rounded-xl border px-2.5 py-2.5 ${
                  job.error
                    ? "border-amber-900/60 bg-amber-950/20"
                    : "border-[var(--border)] bg-[#141922]"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {job.error ? (
                    <span className="text-sm">{job.icon}</span>
                  ) : (
                    <span className="spinner" aria-label="Processing" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug font-medium">
                    {job.label}
                  </p>
                  <p
                    className={`mt-1 text-[11px] leading-snug ${
                      job.error ? "text-amber-300/90" : "text-[var(--accent)]"
                    }`}
                  >
                    {job.error ?? (job.queued ? "Queued…" : "Processing…")}
                  </p>
                </div>
                {job.error && (
                  <button
                    aria-label="Dismiss"
                    className="h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                    onClick={() => dismissJob(job.id)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}

            {sources.map((s) => (
              <li
                key={s.id}
                className={`group flex gap-2.5 rounded-xl border px-2.5 py-2.5 transition ${
                  selected.has(s.id)
                    ? "border-line-strong bg-panel2"
                    : "border-transparent opacity-55 hover:opacity-90"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                  checked={selected.has(s.id)}
                  onChange={() => onToggle(s.id)}
                  aria-label={`Use “${s.title}” in chat and Studio`}
                />
                <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(s.id)}>
                  <div className="flex items-start gap-1.5">
                    <span aria-hidden className="shrink-0 text-sm">
                      {ICONS[s.kind] ?? "📄"}
                    </span>
                    <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                      {s.title}
                    </span>
                  </div>
                  {s.summary && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                      {s.summary}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-dim">{bytes(s.chars)}</p>
                </button>
                <button
                  aria-label={`Remove source ${s.title}`}
                  className="reveal h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-red-400"
                  onClick={() => onRemove(s)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active.length > 0 && (
        <div
          role="status"
          className="shrink-0 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--accent)]"
        >
          Processing {active.length} source{active.length === 1 ? "" : "s"} — you can
          keep adding more.
        </div>
      )}
    </aside>
  );
}
