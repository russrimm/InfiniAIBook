"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import SourcesPanel from "./SourcesPanel";
import SourceUpdates, { type PendingUpdate } from "./SourceUpdates";
import ChatPanel from "./ChatPanel";
import StudioPanel from "./StudioPanel";
import ArtifactModal from "./ArtifactModal";
import SourceModal from "./SourceModal";
import DiscoverModal, { type DiscoverHit } from "./DiscoverModal";
import BrowserModal from "./BrowserModal";
import ModelPicker from "./ModelPicker";
import NotesPanel from "./NotesPanel";
import TransformationsModal from "./TransformationsModal";
import LibraryModal from "./LibraryModal";
import AboutModal from "./AboutModal";
import DiscussionModal from "./DiscussionModal";
import ScreenHelperModal from "./ScreenHelperModal";
import { CitationContext } from "./CitationContext";
import { useDeferredDelete } from "./UndoToast";
import type { SourceHighlight } from "./SourceModal";
import { studioIcon, studioLabel } from "@/lib/studio";
import type {
  Artifact,
  ArtifactSummary,
  ChatSession,
  Citation,
  Message,
  Note,
  Notebook,
  Source,
} from "@/lib/types";
import type { NarrationSettings } from "@/lib/narration";

type Data = {
  notebook: Notebook;
  sources: Source[];
  artifacts: ArtifactSummary[];
  messages: Message[];
  sessions: ChatSession[];
  notes: Note[];
  maxUploadBytes?: number;
};

type Tab = "sources" | "chat" | "studio" | "notes";

export default function Workspace({ notebookId }: { notebookId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  /** Set when the source was opened from a citation, to show the passage. */
  const [sourceHighlight, setSourceHighlight] = useState<SourceHighlight | null>(null);
  /** The title as typed; saved on a pause or on leaving the field. */
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Items deleted but still within their undo window: hidden, not yet gone. */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const deferDelete = useDeferredDelete();
  const [discovering, setDiscovering] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [pickingModel, setPickingModel] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  /** Open live discussion, with the focus it started from. */
  const [discussing, setDiscussing] = useState<{ focus: string } | null>(null);
  const [model, setModel] = useState("");
  const [budgetNote, setBudgetNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  /** Which panel fills the right-hand column on wide screens. */
  const [right, setRight] = useState<"studio" | "notes">("studio");
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [managingTransformations, setManagingTransformations] = useState(false);
  const [pickingLibrary, setPickingLibrary] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [showUpdates, setShowUpdates] = useState(false);
  const [checkingSources, setCheckingSources] = useState(false);
  /** Finished while the user was busy elsewhere; offered rather than forced. */
  const [readyArtifact, setReadyArtifact] = useState<Artifact | null>(null);
  /** Artifact whose body is being fetched, so the list can show it is working. */
  const [openingId, setOpeningId] = useState<string | null>(null);
  /** Reported inline; opening one artifact failing must not blank the notebook. */
  const [openError, setOpenError] = useState<string | null>(null);
  /** Mirrors "something is already on screen" for callbacks held by old renders. */
  const occupied = useRef(false);

  /** Source ids already reflected in `selected`, to detect genuinely new ones. */
  const seenSources = useRef<Set<string>>(new Set());
  /** Guards against an older in-flight load overwriting a newer one. */
  const loadSeq = useRef(0);
  /** Set by SourcesPanel so Discover can queue URLs through the same pipeline. */
  const addSources = useRef<((hits: DiscoverHit[]) => void) | null>(null);

  /** The first load picks the opening tab on narrow screens. */
  const firstLoad = useRef(true);

  const load = useCallback(async (): Promise<Data | null> => {
    const seq = ++loadSeq.current;
    let res: Response;
    try {
      res = await fetch(`/api/notebooks/${notebookId}`);
    } catch {
      // A background poll runs for minutes. A dropped connection, a sleeping
      // laptop or a restarted dev server must not take the notebook down with
      // it — skip this round and try again on the next tick.
      return null;
    }
    if (!res.ok) {
      // A transient 5xx is not "notebook not found"; only say so when the
      // server actually says so.
      if (res.status === 404) setError("Notebook not found.");
      return null;
    }
    const d: Data = await res.json();
    // Uploads finish independently, so several loads can be in flight at once.
    // Only the newest response may touch state, or an older one would drop
    // sources that have since arrived.
    if (seq !== loadSeq.current) return null;

    // Computed out here, not inside the state updater: updaters must stay pure
    // (React invokes them twice in development to enforce exactly that).
    const ids = d.sources.map((s) => s.id);
    const live = new Set(ids);
    const fresh = ids.filter((id) => !seenSources.current.has(id));
    seenSources.current = live;

    setData(d);
    if (firstLoad.current) {
      firstLoad.current = false;
      // An empty notebook's next step is adding a source, not chatting.
      if (d.sources.length === 0) setTab("sources");
    }
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      for (const id of fresh) next.add(id);
      return next;
    });
    return d;
  }, [notebookId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSource = useCallback((id: string, highlight: SourceHighlight | null = null) => {
    setSourceHighlight(highlight);
    setOpenSourceId(id);
  }, []);

  /** Every citation in chat, artifacts and notes opens here, at its passage. */
  const openCitation = useCallback(
    (c: Citation) => openSource(c.sourceId, { part: c.part, snippet: c.snippet }),
    [openSource]
  );

  // Links from search carry ?source=<id>&part=<n> or ?note=<id>; open that
  // passage or note once, then tidy the address so a reload does not reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source");
    const note = params.get("note");
    if (!source && !note) return;
    if (source) {
      const part = Number(params.get("part"));
      openSource(source, Number.isInteger(part) && part > 0 ? { part } : null);
    } else if (note) {
      setRight("notes");
      setTab("notes");
      setOpenNoteId(note);
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, [openSource]);

  /**
   * Linked sources are re-checked when the notebook opens. The request is
   * deliberately not awaited by anything on screen: a slow publisher must not
   * delay the notebook, and a source that has not changed should be invisible.
   */
  const checkSources = useCallback(
    async (force = false) => {
      setCheckingSources(true);
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/check-sources`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { pending: PendingUpdate[] };
        setPendingUpdates(j.pending ?? []);
      } catch {
        /* a failed check is not worth interrupting the notebook over */
      } finally {
        setCheckingSources(false);
      }
    },
    [notebookId]
  );

  useEffect(() => {
    void checkSources();
  }, [checkSources]);

  useEffect(() => {
    occupied.current = Boolean(
      openArtifact ||
        openSourceId ||
        discovering ||
        browsing ||
        pickingModel ||
        aboutOpen ||
        showUpdates ||
        openNoteId ||
        managingTransformations ||
        pickingLibrary
    );
  }, [
    openArtifact,
    openSourceId,
    discovering,
    browsing,
    pickingModel,
    aboutOpen,
    showUpdates,
    openNoteId,
    managingTransformations,
    pickingLibrary,
  ]);

  // Shown in the header so the active model is visible without opening a dialog.
  const loadModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) setModel((await res.json()).current.chat);
      const budget = await fetch("/api/budget");
      if (budget.ok) {
        const status = (await budget.json()) as {
          enabled?: boolean;
          remainingCents?: number | null;
        };
        if (status.enabled && status.remainingCents != null && status.remainingCents < 500) {
          setBudgetNote(
            `$${(status.remainingCents / 100).toFixed(2)} left in today's model budget.`
          );
        } else {
          setBudgetNote(null);
        }
      }
    } catch {
      /* the picker reports failures; the header just stays empty */
    }
  }, []);

  useEffect(() => {
    void loadModel();
  }, [loadModel]);

  const exportNotebook = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/export`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Could not export this notebook.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = (data?.notebook.title || "notebook")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
      a.href = url;
      a.download = `${name || "notebook"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not export this notebook.");
    } finally {
      setExporting(false);
    }
  };

  // Keep the browser tab in step with renames; the server sets it on first load.
  const notebookTitle = data?.notebook.title;
  useEffect(() => {
    if (notebookTitle) document.title = `${notebookTitle} — InfiniAIBook`;
  }, [notebookTitle]);

  /** Bring the Sources panel into view and put focus on its upload control. */
  const showSources = () => {
    setTab("sources");
    setTimeout(() => document.getElementById("add-sources")?.focus(), 0);
  };

  const selectedIds = [...selected].filter((id) => !hidden.has(id));
  const visibleSourceCount = data ? data.sources.filter((s) => !hidden.has(s.id)).length : 0;
  const allSelected = data ? selectedIds.length === visibleSourceCount : false;

  const unhide = useCallback((id: string) => {
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });
  }, []);

  /**
   * Hide an item now and delete it after the undo window. It stays hidden
   * until the notebook has reloaded without it, so it does not flash back; a
   * failed delete reappears on that reload.
   */
  const deferRemove = (id: string, label: string, url: string) => {
    setHidden((h) => new Set(h).add(id));
    deferDelete({
      label,
      url,
      onUndo: () => unhide(id),
      onCommitted: async () => {
        await load();
        unhide(id);
      },
    });
  };

  /**
   * Generation finishes on its own schedule, and stealing the screen for it
   * would undo the point of running in the background. Anything that lands
   * while the user is reading something else waits to be opened.
   *
   * The check reads a ref rather than state: a job started several renders ago
   * still holds the callback it was given, so a captured `openArtifact` would
   * be whatever was open when the user pressed the button — which is how two
   * jobs finishing together both decided the screen was free and one silently
   * replaced the other.
   */
  const openWhenFree = (a: Artifact) => {
    if (occupied.current) setReadyArtifact(a);
    else setOpenArtifact(a);
  };

  /**
   * Open an artifact from the list, which carries no body. Failure is reported
   * inline rather than thrown: a missing artifact is something the user can act
   * on, and it must not take the notebook down.
   */
  const openFromList = async (summary: ArtifactSummary) => {
    setOpeningId(summary.id);
    try {
      const res = await fetch(`/api/artifacts/${summary.id}`);
      if (!res.ok) throw new Error(String(res.status));
      openWhenFree((await res.json()) as Artifact);
    } catch {
      setOpenError("That artifact could not be opened. Try reloading the notebook.");
    } finally {
      setOpeningId(null);
    }
  };
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card p-10 text-center">
          <p className="mb-4 text-[var(--muted)]">{error}</p>
          <Link className="btn" href="/">
            Back to notebooks
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center gap-2 text-sm text-[var(--muted)]"
      >
        <span aria-hidden className="spinner" />
        Loading notebook…
      </div>
    );
  }

  const sources = data.sources.filter((s) => !hidden.has(s.id));
  const artifacts = data.artifacts.filter((a) => !hidden.has(a.id));
  const notes = (data.notes ?? []).filter((n) => !hidden.has(n.id));

  const saveTitle = (value: string) => {
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = null;
    const title = value.trim();
    // An emptied field reverts rather than saving a blank name.
    if (!title || title === data.notebook.title) {
      setTitleDraft(null);
      return;
    }
    setData((d) => (d ? { ...d, notebook: { ...d.notebook, title } } : d));
    setTitleDraft(null);
    void fetch(`/api/notebooks/${notebookId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    })
      // A rename that did not stick must not keep showing as if it had.
      .then((r) => {
        if (!r.ok) void load();
      })
      .catch(() => void load());
  };

  const editTitle = (value: string) => {
    setTitleDraft(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => saveTitle(value), 600);
  };

  return (
    <CitationContext.Provider value={openCitation}>
    <div className="flex h-screen flex-col">
      {/* On narrow screens the actions wrap to a second row so the title keeps its room. */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] px-4 py-3">
        <Link
          href="/"
          aria-label="Back to notebooks"
          title="Back to notebooks"
          className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
        >
          ←
        </Link>
        <span aria-hidden className="text-xl">
          {data.notebook.emoji}
        </span>
        <input
          className="min-w-[11rem] flex-1 basis-[11rem] truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none transition hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-well"
          value={titleDraft ?? data.notebook.title}
          aria-label="Notebook title"
          onChange={(e) => editTitle(e.target.value)}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              if (titleTimer.current) clearTimeout(titleTimer.current);
              setTitleDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
        <span aria-live="polite" className="hidden shrink-0 text-xs text-[var(--muted)] sm:block">
          {checkingSources
            ? "Checking links…"
            : `Using ${selectedIds.length} of ${sources.length} source${sources.length === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <Link
            href={`/search?notebookId=${notebookId}`}
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            title="Search and ask across all notebooks"
            aria-label="Search"
          >
            <span aria-hidden>🔎</span> <span className="hidden md:inline">Search</span>
          </Link>
          <button
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            onClick={() => setHelperOpen(true)}
            title="Share an app and get coached through it step by step"
            aria-label="Screen helper"
          >
            <span aria-hidden>🖥️</span> <span className="hidden md:inline">Screen helper</span>
          </button>
          <button
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            disabled={exporting}
            title="Download this notebook as a zip you can import later"
            onClick={() => void exportNotebook()}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
          <button
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            onClick={() => setPickingModel(true)}
            title="Choose which models to use"
            aria-label={model ? `Models (chat: ${model})` : "Models"}
          >
            <span aria-hidden>🧠</span>{" "}
            <span className="hidden max-w-[10rem] truncate md:inline">{model}</span>
          </button>
          <button
            aria-label="Help and about"
            title="Help & about"
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            onClick={() => setAboutOpen(true)}
          >
            <span aria-hidden>?</span> <span className="hidden md:inline">Help</span>
          </button>
        </div>
      </header>

      {budgetNote && (
        <p className="shrink-0 border-b border-amber-900/50 bg-amber-950/25 px-4 py-2 text-[13px] text-amber-100">
          {budgetNote} Set DAILY_BUDGET_USD to raise it, or 0 to turn the ceiling off.
        </p>
      )}

      {pendingUpdates.length > 0 && (
        <button
          onClick={() => setShowUpdates(true)}
          className="fade-up flex shrink-0 items-center gap-2 border-b border-amber-900/50 bg-amber-950/25 px-4 py-2 text-left text-[12px] text-amber-100 transition hover:bg-amber-950/40"
        >
          <span aria-hidden>🔄</span>
          <span className="flex-1">
            {pendingUpdates.length} linked source
            {pendingUpdates.length === 1 ? " has" : "s have"} changed since they were
            indexed.
          </span>
          <span className="shrink-0 font-medium underline">Review</span>
        </button>
      )}

      <nav
        aria-label="Notebook panels"
        className="flex shrink-0 gap-1 border-b border-[var(--border)] px-3 py-2 lg:hidden"
      >
        {(["sources", "chat", "studio", "notes"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              tab === t
                ? "bg-hover text-[var(--fg)]"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {t}
            {t === "sources" && sources.length ? ` (${selectedIds.length}/${sources.length})` : ""}
            {t === "notes" && notes.length ? ` (${notes.length})` : ""}
          </button>
        ))}
      </nav>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <div
          className={`min-h-0 border-[var(--border)] lg:block lg:border-r ${
            tab === "sources" ? "block" : "hidden"
          }`}
        >
          <SourcesPanel
            notebookId={notebookId}
            sources={sources}
            maxUploadBytes={data.maxUploadBytes}
            selected={selected}
            allSelected={allSelected}
            onToggle={(id) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onToggleAll={() =>
              setSelected(
                allSelected ? new Set() : new Set(sources.map((s) => s.id))
              )
            }
            onOpen={(id) => openSource(id)}
            onRemove={(s) => deferRemove(s.id, `Source “${s.title}”`, `/api/sources/${s.id}`)}
            onChanged={() => void load()}
            onDiscover={() => setDiscovering(true)}
            onBrowse={() => setBrowsing(true)}
            onLibrary={() => setPickingLibrary(true)}
            addRef={addSources}
          />
        </div>

        <div className={`min-h-0 lg:block ${tab === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            notebookId={notebookId}
            sources={sources}
            selectedIds={selectedIds}
            initialMessages={data.messages}
            sessions={data.sessions ?? []}
            onNoteSaved={() => void load()}
            onAddSources={showSources}
            onUseAll={() => setSelected(new Set(sources.map((s) => s.id)))}
            onOpenStudio={() => {
              setRight("studio");
              setTab("studio");
            }}
          />
        </div>

        <div
          className={`flex min-h-0 flex-col border-[var(--border)] lg:flex lg:border-l ${
            tab === "studio" || tab === "notes" ? "flex" : "hidden"
          }`}
        >
          <div className="hidden shrink-0 gap-1 border-b border-[var(--border)] px-3 py-2 lg:flex">
            {(["studio", "notes"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRight(r)}
                aria-pressed={right === r}
                className={`flex-1 rounded-lg px-3 py-1 text-[12px] capitalize transition ${
                  right === r
                    ? "bg-hover text-[var(--fg)]"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                {r}
                {r === "notes" && notes.length ? ` (${notes.length})` : ""}
              </button>
            ))}
          </div>
          {/* On narrow screens the tab bar decides; on wide ones the toggle above. */}
          <div
            className={`min-h-0 flex-1 ${tab === "studio" ? "block" : "hidden"} ${
              right === "studio" ? "lg:block" : "lg:hidden"
            }`}
          >
            <StudioPanel
              notebookId={notebookId}
              hasSources={sources.length > 0}
              selectedIds={selectedIds}
              artifacts={artifacts}
              onOpen={openFromList}
              openingId={openingId}
              onRemove={(a) =>
                deferRemove(a.id, `“${a.title}”`, `/api/artifacts/${a.id}`)
              }
              onChanged={() => void load()}
              narrationDefaults={data.notebook.narration}
              onSaveNarration={async (narration) => {
                const res = await fetch(`/api/notebooks/${notebookId}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ narration }),
                });
                const j = (await res.json().catch(() => ({}))) as {
                  error?: string;
                  narration?: NarrationSettings;
                };
                if (!res.ok || !j.narration) throw new Error(j.error || "Could not save.");
                const saved = j.narration;
                setData((d) => (d ? { ...d, notebook: { ...d.notebook, narration: saved } } : d));
                return saved;
              }}
              onDiscuss={(focus) => setDiscussing({ focus })}
              onShowSources={showSources}
            />
          </div>
          <div
            className={`min-h-0 flex-1 ${tab === "notes" ? "block" : "hidden"} ${
              right === "notes" ? "lg:block" : "lg:hidden"
            }`}
          >
            <NotesPanel
              notebookId={notebookId}
              notes={notes}
              onChanged={() => void load()}
              onRemove={(n) => deferRemove(n.id, `Note “${n.title}”`, `/api/notes/${n.id}`)}
              openNoteId={openNoteId}
              onOpenNote={setOpenNoteId}
              onManageTransformations={() => setManagingTransformations(true)}
            />
          </div>
        </div>
      </main>

      {/* Before the source viewer, so a citation opened mid-call shows on top. */}
      {discussing && (
        <DiscussionModal
          notebookId={notebookId}
          sourceIds={selectedIds}
          initialFocus={discussing.focus}
          onClose={() => setDiscussing(null)}
          onSaved={async (note) => {
            await load();
            setRight("notes");
            setTab("notes");
            setOpenNoteId(note.id);
          }}
        />
      )}
      {openArtifact && (
        <ArtifactModal
          artifact={openArtifact}
          onClose={() => setOpenArtifact(null)}
          onRefresh={async () => {
            try {
              // Fetch just this artifact. Polling the whole notebook pulled
              // every source and message back every four seconds to read one
              // row's progress.
              const res = await fetch(`/api/artifacts/${openArtifact.id}`);
              if (!res.ok) return;
              setOpenArtifact((await res.json()) as Artifact);
            } catch {
              // Polled in the background; a dropped request is not an error
              // worth showing, and the next tick will pick it up.
            }
          }}
        />
      )}
      {openSourceId && (
        <SourceModal
          sourceId={openSourceId}
          highlight={sourceHighlight}
          onClose={() => setOpenSourceId(null)}
          onNoteCreated={async (note) => {
            await load();
            setOpenSourceId(null);
            setRight("notes");
            setTab("notes");
            setOpenNoteId(note.id);
          }}
        />
      )}
      {discovering && (
        <DiscoverModal
          notebookId={notebookId}
          onClose={() => setDiscovering(false)}
          onAdd={(hits) => addSources.current?.(hits)}
        />
      )}
      {browsing && (
        <BrowserModal
          notebookId={notebookId}
          onClose={() => setBrowsing(false)}
          onAdded={() => void load()}
        />
      )}
      {managingTransformations && (
        <TransformationsModal onClose={() => setManagingTransformations(false)} />
      )}
      {pickingLibrary && (
        <LibraryModal
          notebookId={notebookId}
          onClose={() => setPickingLibrary(false)}
          onAdded={() => void load()}
        />
      )}
      {pickingModel && (
        <ModelPicker
          onClose={() => {
            setPickingModel(false);
            void loadModel();
          }}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {helperOpen && (
        <ScreenHelperModal
          notebookId={notebookId}
          onClose={() => setHelperOpen(false)}
          onSaved={async (note) => {
            await load();
            setRight("notes");
            setTab("notes");
            setOpenNoteId(note.id);
          }}
        />
      )}
      {showUpdates && (
        <SourceUpdates
          updates={pendingUpdates}
          onResolved={async () => {
            await load();
            const res = await fetch(`/api/notebooks/${notebookId}/check-sources`);
            if (res.ok) {
              setPendingUpdates(((await res.json()) as { pending: PendingUpdate[] }).pending ?? []);
            }
          }}
          onClose={() => setShowUpdates(false)}
        />
      )}

      {openError && (
        // Same layer as the ready toast: this can happen while a modal is open,
        // and below it the message would be invisible.
        <div className="fade-up fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
          <div
            role="alert"
            className="flex items-center gap-3 rounded-full border border-red-900/60 bg-red-950/40 py-2 pr-2 pl-4 shadow-xl"
          >
            <span className="max-w-[20rem] text-[12px] text-red-200">{openError}</span>
            <button
              className="btn !py-1 !text-[11px]"
              onClick={() => setOpenError(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {readyArtifact && (
        // Above the modal layer on purpose: this only appears when something
        // is already on screen, so at z-40 it would sit behind the very thing
        // that caused it to be shown.
        <div className="fade-up fixed bottom-4 left-1/2 z-[60] -translate-x-1/2">
          <div
            role="status"
            className="flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--panel)] py-2 pr-2 pl-4 shadow-xl"
          >
            <span aria-hidden className="text-base">
              {studioIcon(readyArtifact.type)}
            </span>
            <span className="max-w-[16rem] truncate text-[12px]">
              <span className="text-[var(--muted)]">
                {studioLabel(readyArtifact.type)} ready ·{" "}
              </span>
              {readyArtifact.title}
            </span>
            <button
              className="btn btn-primary !py-1 !text-[11px]"
              onClick={() => {
                setOpenArtifact(readyArtifact);
                setReadyArtifact(null);
              }}
            >
              Open
            </button>
            <button
              aria-label="Dismiss"
              className="rounded px-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
              onClick={() => setReadyArtifact(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
    </CitationContext.Provider>
  );
}
