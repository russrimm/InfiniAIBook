"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Source } from "@/lib/types";
import { MAX_TITLE_CHARS } from "@/lib/limits";
import { useWindowFileDrop } from "./useWindowFileDrop";
import type { DiscoverHit } from "./DiscoverModal";
import { BulkBar, RowTags, TagFilter } from "./SourceTags";
import { hasTag, tagCounts } from "@/lib/tags";

const ICONS: Record<string, string> = {
  pdf: "📕",
  docx: "📘",
  pptx: "📙",
  zip: "🗜️",
  url: "🌐",
  html: "🌐",
  youtube: "📺",
  "youtube-description": "📺",
  text: "📝",
  md: "📝",
  txt: "📄",
  csv: "📊",
  json: "🔧",
  har: "🔧",
  xml: "🔧",
  gpx: "🗺️",
  kml: "🗺️",
  tsv: "📊",
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

/** The remove control of the closest row in one direction that has one. */
function siblingControl(
  row: Element | null,
  direction: "nextElementSibling" | "previousElementSibling"
): HTMLElement | null {
  for (let el = row?.[direction] ?? null; el; el = el[direction]) {
    const control = el.querySelector<HTMLElement>("[data-row-remove]");
    if (control) return control;
  }
  return null;
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
  /** Present on a failed add, so the same request can be sent again. */
  retry?: () => void;
};

let jobSeq = 0;

/**
 * Uploads run a few at a time. Dropping twenty files used to start twenty
 * ingests at once — twenty PDFs parsed together and twenty bursts of
 * embedding calls, which is how a provider's rate limit got tripped.
 */
const CONCURRENT_UPLOADS = 3;

/** A filter box earns its space once the list is too long to scan. */
const FILTER_FROM = 6;

function formatMb(n: number) {
  return `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
}

/** Slide text and speaker notes from a deck too large to upload. */
async function readLargeDeck(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  // A real .pptx is a ZIP; anything else is encrypted, legacy or not a deck.
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    throw new Error(
      `"${file.name}" cannot be read. It may be password-protected, rights-managed or an old .ppt file; re-save it as an unprotected .pptx and try again.`
    );
  }
  const { pptxToText } = await import("@/lib/pptx");
  const text = (await pptxToText(data)).trim();
  if (!text) {
    throw new Error(
      `"${file.name}" has no text on its slides or in its speaker notes; it may contain only images.`
    );
  }
  return text;
}

export default function SourcesPanel({
  notebookId,
  sources,
  maxUploadBytes,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onSelectMany,
  onOpen,
  onRemove,
  onRemoveMany,
  onChanged,
  onDiscover,
  onLearn,
  liveLearn = false,
  onBrowse,
  onLibrary,
  addRef,
  pinned,
  adding,
  onToggleAdding,
  onTogglePin,
  onClose,
  onDropped,
}: {
  notebookId: string;
  sources: Source[];
  /** Server's upload limit, so oversized files are refused before sending. */
  maxUploadBytes?: number;
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** Tick exactly these sources (`only`) or add them to the ticked ones. */
  onSelectMany: (ids: string[], only: boolean) => void;
  onOpen: (id: string) => void;
  /** Delete with an undo window; the panel only asks. */
  onRemove: (s: Source) => void;
  /** Delete several at once, with one undo. */
  onRemoveMany: (items: Source[]) => void;
  onChanged: () => Promise<void> | void;
  onDiscover: () => void;
  onLearn: () => void;
  liveLearn?: boolean;
  onBrowse: () => void;
  /** Reuse a source that already lives in another notebook. */
  onLibrary: () => void;
  addRef: React.MutableRefObject<((hits: DiscoverHit[]) => void) | null>;
  pinned: boolean;
  adding: boolean;
  onToggleAdding: () => void;
  onTogglePin: () => void;
  onClose: () => void;
  /** Files were dropped anywhere on the page and are now uploading here; show this panel. */
  onDropped?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mode, setMode] = useState<"none" | "url" | "text">("none");
  const linkBtn = useRef<HTMLButtonElement>(null);
  const textBtn = useRef<HTMLButtonElement>(null);
  // Escape dismisses the inline form and hands focus back to the button that opened it.
  const closeInline = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    (mode === "url" ? linkBtn : textBtn).current?.focus();
    setMode("none");
  };
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [editingTagsId, setEditingTagsId] = useState<string | null>(null);

  const startRename = (s: Source) => {
    setEditingId(s.id);
    setDraft(s.title);
    setRenameError(null);
  };
  const cancelRename = () => {
    const id = editingId;
    setEditingId(null);
    setRenameError(null);
    // Hand focus back to the row's rename button so keyboard users keep their place.
    setTimeout(() => {
      document.querySelector<HTMLElement>(`#source-list [data-rename="${id}"]`)?.focus();
    }, 0);
  };
  const saveRename = async (s: Source) => {
    const title = draft.replace(/\s+/g, " ").trim();
    if (!title) {
      setRenameError("Give the source a name.");
      return;
    }
    if (title === s.title) {
      cancelRename();
      return;
    }
    try {
      const res = await fetch(`/api/sources/${s.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not rename this source.");
      await onChanged();
      cancelRename();
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : "Could not rename this source.");
    }
  };

  // The filter box only exists for longer lists, so a leftover filter must not hide a short one.
  const needle = sources.length >= FILTER_FROM ? filter.trim().toLowerCase() : "";
  const tags = tagCounts(sources);
  // A tag that no source carries any more cannot keep filtering.
  const activeTag = tagFilter && tags.some((t) => t.tag.toLowerCase() === tagFilter.toLowerCase()) ? tagFilter : null;
  const visibleSources = sources.filter(
    (s) =>
      (!needle || `${s.title} ${s.summary ?? ""}`.toLowerCase().includes(needle)) &&
      (!activeTag || hasTag(s.tags ?? [], activeTag)),
  );
  const filtering = Boolean(needle || activeTag);
  const tickedHere = visibleSources.filter((s) => selected.has(s.id));

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

  /**
   * `init` may be a function, for requests that need work first (such as
   * reading a deck in the browser); it runs once the job leaves the queue.
   * `notice` is shown after a successful add, for anything the user should know.
   */
  const startJob = (
    label: string,
    icon: string,
    init: RequestInit | (() => Promise<RequestInit>),
    notice?: string
  ) => {
    const id = `job-${++jobSeq}`;
    setJobs((prev) => [...prev, { id, label, icon, queued: true }]);

    queue.current.push(async () => {
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, queued: false } : j)));
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
          method: "POST",
          ...(typeof init === "function" ? await init() : init),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not add this source");

        // An archive adds several sources in one request, so some may fail
        // while the rest land; only fail the row if nothing was added.
        const addedCount: number = json.added?.length ?? 0;
        const errors: string[] = json.errors ?? [];
        if (errors.length && !addedCount) throw new Error(errors[0]);
        const notices: string[] = [
          ...errors,
          ...(json.warnings ?? []),
          ...(notice ? [notice] : []),
        ];

        await onChanged();
        refreshForSummaries();
        setJobs((prev) => prev.filter((j) => j.id !== id));
        if (notices.length) {
          // Not fatal, but the user should know what was degraded or left out.
          setJobs((prev) => [
            ...prev,
            ...notices.map((error, n) => ({ id: `${id}-warn-${n}`, label, icon: "⚠️", error })),
          ]);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not add this source";
        const retry = () => {
          setJobs((prev) => prev.filter((j) => j.id !== id));
          startJob(label, icon, init, notice);
        };
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, error: message, retry } : j)));
      }
    });
    pump();
  };

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (maxUploadBytes && file.size > maxUploadBytes) {
        // Only the text is wanted from a deck, and that is small however large
        // the images and video make the file, so read it here instead.
        if (/\.pptx$/i.test(file.name)) {
          startJob(
            file.name,
            iconFor(file.name),
            async () => ({
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                title: file.name,
                kind: "pptx",
                text: await readLargeDeck(file),
              }),
            }),
            `${formatMb(file.size)} is over the ${formatMb(maxUploadBytes)} upload limit, so only the slide text and speaker notes were imported.`
          );
          continue;
        }
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

  // A file dropped anywhere on the page, not only on the zone below, is added.
  const pageDragging = useWindowFileDrop((files) => {
    uploadFiles(files);
    onDropped?.();
  });

  const addUrl = (url: string, title?: string, learn = false) => {
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
      body: JSON.stringify(learn ? { learnUrl: url } : { url, title }),
    });
  };

  // Lets the Discover modal queue its selections through the same pipeline.
  useEffect(() => {
    addRef.current = (hits: DiscoverHit[]) =>
      hits.forEach((h) => addUrl(h.url, h.title, h.provider === "microsoft-learn"));
    return () => {
      addRef.current = null;
    };
  });

  /**
   * A removed row takes the focused button with it, which would drop focus to
   * the page. Hand it to the nearest row below (then above) that has a remove
   * control, or to the list itself, so several rows can be removed in a row.
   */
  const keepFocusNear = (button: HTMLElement) => {
    const row = button.closest("li");
    const next: HTMLElement | null =
      siblingControl(row, "nextElementSibling") ?? siblingControl(row, "previousElementSibling");
    setTimeout(() => {
      const list = document.getElementById("source-list");
      const target = next?.isConnected ? next : list;
      target?.focus({ preventScroll: false });
    }, 0);
  };

  const dismissJob = (id: string, button: HTMLElement) => {
    keepFocusNear(button);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const removeSource = (s: Source, button: HTMLElement) => {
    keepFocusNear(button);
    onRemove(s);
  };

  const active = jobs.filter((j) => !j.error);

  return (
    <aside
      aria-labelledby="sources-heading"
      className="flex h-full min-h-0 flex-col bg-[var(--panel)]"
    >
      {pageDragging &&
        // A portal, because this panel is hidden while collapsed and a hidden
        // parent would hide the cue with it.
        createPortal(
          <div
            data-testid="page-drop"
            className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_72%,transparent)] p-6"
          >
            <div className="rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--panel)] px-10 py-8 text-center shadow-xl">
              <div aria-hidden className="mb-2 text-3xl">
                📎
              </div>
              <p className="text-[15px] font-medium">Drop files to add them as sources</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                PDF, DOCX, PPTX, EPUB, ZIP, text, images, audio and video
              </p>
            </div>
          </div>,
          document.body
        )}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 id="sources-heading" className="text-sm font-semibold tracking-wide">
            Sources
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px]"
              aria-label={pinned ? "Unpin sources panel" : "Pin sources panel"}
              aria-pressed={pinned}
              title={pinned ? "Unpin to collapse when you click outside" : "Keep Sources open"}
              onClick={onTogglePin}
            >
              {pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              className="btn !px-2 !py-1 !text-[11px]"
              aria-label="Collapse sources panel"
              onClick={onClose}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          {sources.length > 0 && (
            <button
              id="select-all-sources"
              className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
              onClick={onToggleAll}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
          {sources.length > 1 && (
            <button
              type="button"
              className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
              aria-pressed={managing}
              title="Tag or delete several sources at once"
              onClick={() => setManaging((m) => !m)}
            >
              Manage
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {liveLearn
            ? "Chat uses ticked sources and live Microsoft Learn. Studio uses only ticked saved sources."
            : sources.length > 0
            ? "Ticked sources are the only ones Chat and Studio use. Click a source to read it."
            : "Add what you want to research. Chat and Studio use only these."}
        </p>
        <button
          type="button"
          className="btn mt-3 w-full !py-1.5 !text-xs"
          aria-controls="source-add-tools"
          aria-expanded={adding}
          onClick={onToggleAdding}
        >
          {adding ? "Hide upload tools" : "Add sources"}
        </button>
      </div>

      <div
        id="source-add-tools"
        hidden={!adding}
        className="max-h-[55%] shrink-0 overflow-y-auto px-4 pb-3"
      >
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
              ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]"
              : "border-[var(--border)] hover:border-line-hover hover:bg-row"
          }`}
        >
          <span aria-hidden className="mb-1 block text-lg">
            📎
          </span>
          <span className="block text-xs font-medium">Drop files or click to upload</span>
          <span className="mt-1 block text-[11px] text-[var(--muted)]">
            PDF · DOCX · PPTX · TXT · MD · CSV · HTML · ZIP · audio/video (transcribed)
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept={`.pdf,.docx,.pptx,.epub,.zip,.txt,.md,.csv,.tsv,.json,.har,.xml,.gpx,.kml,.html,.htm,${MEDIA_ACCEPT}`}
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            ref={linkBtn}
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "url" ? "none" : "url")}
            aria-expanded={mode === "url"}
            title="Add a web page or YouTube link"
          >
            <span aria-hidden>🔗</span> Add link
          </button>
          <button
            ref={textBtn}
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
            onClick={onLearn}
            title="Import Microsoft Learn documentation or enable live Learn in chat"
          >
            Microsoft Learn
          </button>
          <button
            className="btn col-span-2 !px-2 !py-1.5 !text-xs"
            onClick={onLibrary}
            title="Reuse a source that is already in another notebook"
          >
            <span aria-hidden>📚</span> From other notebooks
          </button>
        </div>
        {liveLearn && (
          <p className="mt-2 text-[11px] text-[var(--muted)]">Microsoft Learn live chat is on.</p>
        )}

        {mode === "url" && (
          <form
            className="fade-up mt-2 flex gap-2"
            onKeyDown={closeInline}
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
              placeholder="Web page or YouTube link"
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
            onKeyDown={closeInline}
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

      <div
        id="source-list"
        role="region"
        aria-label="Source synopses"
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
      >
        {jobs.length === 0 && sources.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
            {liveLearn
              ? "No saved sources yet. Live Microsoft Learn is available in chat. Import pages to use them in Studio."
              : "No sources yet. Everything you ask and generate is grounded in what you add here."}
          </p>
        ) : (
          <>
            {sources.length >= FILTER_FROM && (
              <div className="sticky top-0 z-10 -mx-1 mb-1 bg-[var(--panel)] px-1 pb-2 pt-1">
                <input
                  type="search"
                  className="input w-full !py-1.5 text-[13px]"
                  placeholder="Filter sources by name or summary"
                  aria-label="Filter sources"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
                {needle && (
                  <p role="status" className="mt-1 text-[11px] text-[var(--muted)]">
                    Showing {visibleSources.length} of {sources.length} sources. Hidden sources keep their ticks.
                  </p>
                )}
              </div>
            )}
            {tags.length > 0 && (
              <div className="mb-2 px-1">
                <TagFilter tags={tags} active={activeTag} onChange={setTagFilter} />
              </div>
            )}
            {filtering && visibleSources.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-[var(--muted)]">
                <span>
                  {visibleSources.length} showing{activeTag ? ` tagged “${activeTag}”` : ""}.
                </span>
                <button type="button" className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => onSelectMany(visibleSources.map((s) => s.id), false)}>
                  Tick these
                </button>
                <button type="button" className="btn !px-2 !py-0.5 !text-[11px]" onClick={() => onSelectMany(visibleSources.map((s) => s.id), true)}>
                  Only these
                </button>
              </div>
            )}
            {managing && (
              <BulkBar
                notebookId={notebookId}
                targets={tickedHere}
                tags={tags.map((t) => t.tag)}
                onChanged={onChanged}
                onRemoveMany={onRemoveMany}
              />
            )}
          <ul className="space-y-1">
            {jobs.map((job) => (
              <li
                key={job.id}
                className={`fade-up flex gap-2.5 rounded-xl border px-2.5 py-2.5 ${
                  job.error
                    ? "border-amber-900/60 bg-amber-950/20"
                    : "border-[var(--border)] bg-sunk"
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
                  {job.retry && (
                    <button
                      type="button"
                      className="btn mt-1.5 !px-2 !py-0.5 !text-[11px]"
                      aria-label={`Try adding ${job.label} again`}
                      onClick={(e) => {
                        keepFocusNear(e.currentTarget);
                        job.retry?.();
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
                {job.error && (
                  <button
                    aria-label="Dismiss"
                    data-row-remove
                    className="h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                    onClick={(e) => dismissJob(job.id, e.currentTarget)}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}

            {visibleSources.map((s) => (
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
                {editingId === s.id ? (
                  <form
                    className="min-w-0 flex-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveRename(s);
                    }}
                  >
                    <label className="sr-only" htmlFor={`rename-${s.id}`}>
                      Source name
                    </label>
                    <input
                      id={`rename-${s.id}`}
                      className="input w-full !py-1 text-[13px]"
                      value={draft}
                      maxLength={MAX_TITLE_CHARS}
                      autoFocus
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return;
                        e.preventDefault();
                        e.stopPropagation();
                        cancelRename();
                      }}
                    />
                    {renameError && <p className="mt-1 text-[11px] text-red-300">{renameError}</p>}
                    <div className="mt-1.5 flex gap-1.5">
                      <button type="submit" className="btn btn-primary !px-2 !py-0.5 !text-[11px]">
                        Save name
                      </button>
                      <button type="button" className="btn !px-2 !py-0.5 !text-[11px]" onClick={cancelRename}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                  <button className="w-full text-left" onClick={() => onOpen(s.id)}>
                    <div className="flex items-start gap-1.5">
                      <span aria-hidden className="shrink-0 text-sm">
                        {ICONS[s.kind] ?? "📄"}
                      </span>
                      <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                        {s.title}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed break-words text-[var(--muted)]">
                      {s.summary?.trim() || "No synopsis available."}
                    </p>
                    <p className="mt-1 text-[10px] text-dim">{bytes(s.chars)}</p>
                  </button>
                  <RowTags
                    source={s}
                    editing={editingTagsId === s.id}
                    onFilter={setTagFilter}
                    onDone={() => setEditingTagsId(null)}
                    onChanged={onChanged}
                  />
                  </div>
                )}
                {editingId !== s.id && (
                  <button
                    type="button"
                    aria-label={`Edit tags for ${s.title}`}
                    className="reveal h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                    onClick={() => setEditingTagsId(s.id)}
                  >
                    <span aria-hidden>#</span>
                  </button>
                )}
                {editingId !== s.id && (
                  <button
                    type="button"
                    aria-label={`Rename source ${s.title}`}
                    data-rename={s.id}
                    className="reveal h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                    onClick={() => startRename(s)}
                  >
                    ✎
                  </button>
                )}
                <button
                  aria-label={`Remove source ${s.title}`}
                  data-row-remove
                  className="reveal h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] transition hover:text-red-400"
                  onClick={(e) => removeSource(s, e.currentTarget)}
                >
                  ✕
                </button>
              </li>
            ))}
            {filtering && visibleSources.length === 0 && (
              <li className="px-2 py-6 text-center text-xs text-[var(--muted)]">
                            No source matches{needle ? ` “${filter.trim()}”` : ""}
                            {activeTag ? ` with the tag “${activeTag}”` : ""}. Clear the filter to see all {sources.length}.
              </li>
            )}
          </ul>
          </>
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
