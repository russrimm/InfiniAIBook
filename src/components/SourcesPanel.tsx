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

/** An upload still being processed on the server. */
type Job = {
  id: string;
  label: string;
  icon: string;
  error?: string;
};

let jobSeq = 0;

export default function SourcesPanel({
  notebookId,
  sources,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onOpen,
  onChanged,
  onDiscover,
  onBrowse,
  onLibrary,
  addRef,
}: {
  notebookId: string;
  sources: Source[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void> | void;
  onDiscover: () => void;
  onBrowse: () => void;
  /** Reuse a source that already lives in another notebook. */
  onLibrary: () => void;
  addRef: React.MutableRefObject<((hits: DiscoverHit[]) => void) | null>;
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
   * page fetch, embedding a long transcript) never block the next upload. The
   * panel stays interactive and shows one spinner per item in flight.
   */
  const startJob = (label: string, icon: string, init: RequestInit) => {
    const id = `job-${++jobSeq}`;
    setJobs((prev) => [...prev, { id, label, icon }]);

    void (async () => {
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
    })();
  };

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
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

  const remove = async (id: string) => {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    await onChanged();
  };

  const dismissJob = (id: string) => setJobs((prev) => prev.filter((j) => j.id !== id));

  const active = jobs.filter((j) => !j.error);

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--panel)]">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold tracking-wide">Sources</h2>
        {sources.length > 0 && (
          <button
            className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
            onClick={onToggleAll}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="px-4 pb-3">
        <div
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
          className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition ${
            dragging
              ? "border-[var(--accent)] bg-[rgba(124,140,255,0.06)]"
              : "border-[var(--border)] hover:border-[#39424f] hover:bg-[#161a21]"
          }`}
        >
          <div className="mb-1 text-lg">📎</div>
          <p className="text-xs font-medium">Drop files or click to upload</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            PDF · DOCX · TXT · MD · CSV · HTML · audio/video (transcribed)
          </p>
        </div>
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

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "url" ? "none" : "url")}
          >
            🌐 Link
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "text" ? "none" : "text")}
          >
            📝 Paste
          </button>
          <button className="btn !px-2 !py-1.5 !text-xs" onClick={onDiscover}>
            🔎 Find
          </button>
          <button className="btn !px-2 !py-1.5 !text-xs" onClick={onBrowse}>
            🌐 Browse
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={onLibrary}
            title="Reuse a source from another notebook"
          >
            📚 Library
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
              placeholder="https://example.com or a YouTube link"
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
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
            />
            <textarea
              className="input h-28 resize-none"
              placeholder="Paste your text here…"
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
            No sources yet. Everything you generate is grounded in what you add here.
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
                    {job.error ?? "Processing…"}
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
                    ? "border-[#2f3846] bg-[#171b21]"
                    : "border-transparent opacity-55 hover:opacity-90"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                  checked={selected.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
                <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(s.id)}>
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-sm">{ICONS[s.kind] ?? "📄"}</span>
                    <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                      {s.title}
                    </span>
                  </div>
                  {s.summary && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                      {s.summary}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[#6b7482]">{bytes(s.chars)}</p>
                </button>
                <button
                  aria-label="Remove source"
                  className="h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  onClick={() => void remove(s.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active.length > 0 && (
        <div className="shrink-0 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--accent)]">
          Processing {active.length} source{active.length === 1 ? "" : "s"} — you can
          keep adding more.
        </div>
      )}
    </aside>
  );
}
