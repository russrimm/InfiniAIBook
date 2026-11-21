"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CommandPalette from "./CommandPalette";
import { isPaletteShortcut, type Command } from "@/lib/commands";
import SourcesPanel from "./SourcesPanel";
import SourceUpdates, { type PendingUpdate } from "./SourceUpdates";
import ChatPanel from "./ChatPanel";
import ThemeToggle, { useThemePreference } from "./ThemeToggle";
import OverflowMenu, { type OverflowItem } from "./OverflowMenu";
import {
  AddSourceIcon,
  AutoThemeIcon,
  BackIcon,
  DownloadIcon,
  HelpIcon,
  ModelIcon,
  MoonIcon,
  ScreenIcon,
  SearchIcon,
  SunIcon,
} from "./icons";
import StudioPanel from "./StudioPanel";
import ArtifactModal from "./ArtifactModal";
import SourceModal from "./SourceModal";
import DiscoverModal, { type DiscoverHit } from "./DiscoverModal";
import LearnCitationModal from "./LearnCitationModal";
import BrowserModal from "./BrowserModal";
import ModelPicker from "./ModelPicker";
import NotesPanel from "./NotesPanel";
import TransformationsModal from "./TransformationsModal";
import LibraryModal from "./LibraryModal";
import AboutModal from "./AboutModal";
import ShortcutsModal from "./ShortcutsModal";
import { SHORTCUTS, shortcutFor } from "@/lib/shortcuts";
import DiscussionModal from "./DiscussionModal";
import ScreenHelperModal from "./ScreenHelperModal";
import { CitationContext } from "./CitationContext";
import { useDeferredDelete } from "./UndoToast";
import type { SourceHighlight } from "./SourceModal";
import { STUDIO, studioIcon, studioLabel } from "@/lib/studio";
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
  const [learning, setLearning] = useState(false);
  const [learnCitation, setLearnCitation] = useState<Citation | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [pickingModel, setPickingModel] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const router = useRouter();
  const [helperOpen, setHelperOpen] = useState(false);
  /** Open live discussion, with the focus it started from. */
  const [discussing, setDiscussing] = useState<{ focus: string } | null>(null);
  const [model, setModel] = useState("");
  /** False when no model provider is set up, so chat and Studio cannot work yet. */
  const [providerReady, setProviderReady] = useState(true);
  const [budgetNote, setBudgetNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesPinned, setSourcesPinned] = useState(false);
  const [sourceAdding, setSourceAdding] = useState(false);
  const sourcesPanel = useRef<HTMLDivElement>(null);
  const sourcesButton = useRef<HTMLButtonElement>(null);
  const mobileAddButton = useRef<HTMLButtonElement>(null);
  const theme = useThemePreference();
  const sourcesReturnFocus = useRef<HTMLElement | null>(null);
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
    (c: Citation) => {
      if (c.url) setLearnCitation(c);
      else openSource(c.sourceId, { part: c.part, snippet: c.snippet });
    },
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
        learning ||
        learnCitation ||
        browsing ||
        pickingModel ||
        aboutOpen ||
        shortcutsOpen ||
        paletteOpen ||
        showUpdates ||
        openNoteId ||
        managingTransformations ||
        pickingLibrary
    );
  }, [
    openArtifact,
    openSourceId,
    discovering,
    learning,
    learnCitation,
    browsing,
    pickingModel,
    aboutOpen,
    shortcutsOpen,
    paletteOpen,
    showUpdates,
    openNoteId,
    managingTransformations,
    pickingLibrary,
  ]);

  // Shown in the header so the active model is visible without opening a dialog.
  const loadModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const info = (await res.json()) as { configured?: boolean; current: { chat: string } };
        setProviderReady(info.configured !== false);
        setModel(info.configured === false ? "" : info.current.chat);
      }
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

  // Notebook shortcuts: "?" lists them, "/" jumps to the question box. They are
  // ignored while typing and while any dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      if (action === "help") {
        setShortcutsOpen(true);
        return;
      }
      const find = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Question"]');
      const box = find();
      if (box && box.offsetParent !== null) {
        box.focus();
        return;
      }
      // On a narrow screen the chat may be on another tab.
      setTab("chat");
      setTimeout(() => find()?.focus(), 50);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl/Cmd+K opens the command palette from anywhere, even while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e) || e.repeat) return;
      e.preventDefault();
      setPaletteOpen((open) => {
        if (open) return false;
        // Not on top of another dialog; the palette would have to close it first.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
        return true;
      });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

  /** Bring the Sources panel into view and put focus on one of its controls. */
  const revealSources = (focusId: string, adding = false) => {
    if (
      document.activeElement instanceof HTMLElement &&
      !sourcesPanel.current?.contains(document.activeElement)
    ) {
      sourcesReturnFocus.current = document.activeElement;
    }
    setSourceAdding(adding);
    setSourcesOpen(true);
    setTab("sources");
    setTimeout(() => document.getElementById(focusId)?.focus(), 0);
  };
  const viewSources = () => revealSources("source-list");
  const showSources = () => revealSources("add-sources", true);
  const chooseSources = () => revealSources("select-all-sources");

  const closeSources = useCallback(() => {
    setSourcesOpen(false);
    setSourcesPinned(false);
    setTab((current) => current === "sources" ? "chat" : current);
    if (sourcesReturnFocus.current?.isConnected) sourcesReturnFocus.current.focus();
    else {
      // Only one of the two Add sources buttons is on screen at any width.
      [sourcesButton.current, mobileAddButton.current]
        .find((button) => button && button.getClientRects().length > 0)
        ?.focus();
    }
  }, []);

  useEffect(() => {
    if (!sourcesOpen || sourcesPinned) return;
    const dismissOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        // Removing a row (delete, dismiss) detaches the clicked button before
        // this handler runs, so containment is checked on the dispatch path.
        (sourcesPanel.current && event.composedPath().includes(sourcesPanel.current)) ||
        target.closest('[aria-controls="sources-panel"], [data-keeps-sources-open]') ||
        // A click inside a dialog (a confirmation closes itself before this runs) is not outside the panel.
        event.composedPath().some((el) => el instanceof Element && el.matches('[role="dialog"], [role="alertdialog"]')) ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) return;
      setSourcesOpen(false);
      setTab((current) => current === "sources" ? "chat" : current);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        event.preventDefault();
        closeSources();
      }
    };
    document.addEventListener("click", dismissOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("click", dismissOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [sourcesOpen, sourcesPinned, closeSources]);

  const sourcesVisible = sourcesOpen || sourcesPinned;

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

  /** The same for several sources at once: one Undo brings them all back. */
  const deferRemoveMany = (items: Source[]) => {
    const ids = items.map((s) => s.id);
    setHidden((h) => new Set([...h, ...ids]));
    const urls: string[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      urls.push(`/api/notebooks/${notebookId}/sources/bulk?ids=${ids.slice(i, i + 40).join(",")}`);
    }
    const restore = () =>
      setHidden((h) => {
        const next = new Set(h);
        for (const id of ids) next.delete(id);
        return next;
      });
    deferDelete({
      label: `${items.length} sources`,
      url: urls[0],
      urls,
      onUndo: restore,
      onCommitted: async () => {
        await load();
        restore();
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

  const ThemeIcon = theme.pref === "light" ? SunIcon : theme.pref === "dark" ? MoonIcon : AutoThemeIcon;
  // Everything the compact header does not show as its own button.
  const moreItems: OverflowItem[] = [
    {
      key: "search",
      label: "Search",
      detail: "Across all notebooks",
      icon: <SearchIcon />,
      href: `/search?notebookId=${notebookId}`,
    },
    {
      key: "helper",
      label: "Screen helper",
      detail: "Get coached through an app",
      icon: <ScreenIcon />,
      onSelect: () => setHelperOpen(true),
    },
    {
      key: "models",
      label: "Models",
      detail: model ? `Chat: ${model}` : undefined,
      icon: <ModelIcon />,
      onSelect: () => setPickingModel(true),
    },
    {
      key: "export",
      label: exporting ? "Exporting…" : "Export notebook",
      detail: "Download as a zip",
      icon: <DownloadIcon />,
      disabled: exporting,
      onSelect: () => void exportNotebook(),
    },
    {
      key: "theme",
      label: `Theme: ${theme.label}`,
      detail: `Switch to ${theme.nextLabel}`,
      icon: <ThemeIcon />,
      keepOpen: true,
      onSelect: theme.cycle,
      testId: "theme-menu-item",
    },
    {
      key: "palette",
      label: "Command palette",
      detail: "Ctrl+K · find any action, format or source",
      icon: <SearchIcon />,
      onSelect: () => setPaletteOpen(true),
    },
    {
      key: "help",
      label: "Help & about",
      icon: <HelpIcon />,
      onSelect: () => setAboutOpen(true),
    },
  ];

  const focusQuestion = () => {
    const find = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Question"]');
    setTab("chat");
    setTimeout(() => find()?.focus(), 60);
  };
  /** Bring the Studio forward and put focus on one format's Generate button, when it is on screen. */
  const goToFormat = (type: string) => {
    setRight("studio");
    setTab("studio");
    setTimeout(() => {
      const button = document.querySelector<HTMLElement>(`button[aria-label="Generate ${STUDIO[type as keyof typeof STUDIO].label}"]`);
      button?.scrollIntoView({ block: "center" });
      button?.focus();
    }, 150);
  };

  const commands: Command[] = paletteOpen
    ? [
        { id: "ask", group: "Actions", label: "Ask a question", detail: "Jump to the question box", keys: "/", keywords: "chat focus", run: focusQuestion },
        {
          id: "find-chat",
          group: "Actions",
          label: "Find in this chat",
          detail: "Search the conversation",
          keywords: "search messages",
          run: () => {
            setTab("chat");
            setTimeout(() => window.dispatchEvent(new Event("infiniaibook:chat-find")), 60);
          },
        },
        { id: "add-sources", group: "Actions", label: "Add sources", detail: "Upload files, add a link or paste text", keywords: "upload import", run: showSources },
        { id: "choose-sources", group: "Actions", label: "Choose sources", detail: "Tick the sources Chat and Studio use", keywords: "select", run: chooseSources },
        { id: "studio", group: "Actions", label: "Go to Studio", detail: "Create reports, audio, video and more", run: () => { setRight("studio"); setTab("studio"); } },
        { id: "notes", group: "Actions", label: "Go to Notes", run: () => { setRight("notes"); setTab("notes"); } },
        { id: "search", group: "Actions", label: "Search all notebooks", keywords: "find", run: () => router.push(`/search?notebookId=${notebookId}`) },
        { id: "home", group: "Actions", label: "Back to all notebooks", keywords: "home list", run: () => router.push("/") },
        { id: "export", group: "Actions", label: "Export this notebook", detail: "Download as a zip", keywords: "download backup", run: () => void exportNotebook() },
        { id: "models", group: "Actions", label: "Choose the chat model", detail: model ? `Now: ${model}` : undefined, keywords: "provider", run: () => setPickingModel(true) },
        { id: "theme", group: "Actions", label: `Switch theme (now ${theme.label})`, keywords: "dark light appearance", run: theme.cycle },
        { id: "helper", group: "Actions", label: "Screen helper", detail: "Get coached through an app", run: () => setHelperOpen(true) },
        { id: "help", group: "Actions", label: "Help and about", keywords: "documentation", run: () => setAboutOpen(true) },
        ...(Object.keys(STUDIO) as (keyof typeof STUDIO)[]).map(
          (type): Command => ({
            id: `studio-${type}`,
            group: "Studio",
            label: STUDIO[type].label,
            detail: STUDIO[type].blurb,
            keywords: `generate create make ${type}`,
            run: () => goToFormat(type),
          }),
        ),
        ...sources.map(
          (s): Command => ({ id: `source-${s.id}`, group: "Sources", label: s.title, detail: s.summary?.trim() || undefined, keywords: `source open read ${s.kind}`, run: () => openSource(s.id) }),
        ),
        ...SHORTCUTS.map(
          (s, i): Command => ({
            id: `shortcut-${i}`,
            group: "Shortcuts",
            label: `${s.keys.join(" + ")}: ${s.does}`,
            detail: s.where,
            keys: s.keys.join("+"),
            keywords: "keyboard keys",
            run: () => setShortcutsOpen(true),
          }),
        ),
      ]
    : [];

  return (
    <CitationContext.Provider value={openCitation}>
    <div className="relative flex h-dvh flex-col overflow-clip">
      {/*
        The workspace is exactly one dynamic viewport tall and never scrolls
        itself; panes scroll internally. relative + overflow-clip makes this the
        containing block and clip for absolutely positioned descendants (such as
        sr-only text) that would otherwise escape a pane's scroller and stretch
        the document, and clip (unlike hidden) cannot be scrolled by focus.
      */}
      {/*
        Below md the header is one compact row: back, notebook, title, Add
        sources and a More menu holding everything secondary, all 44px touch
        targets. From md up the original labeled actions wrap as before.
      */}
      <header className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 py-1.5 md:flex-wrap md:gap-x-3 md:gap-y-2 md:px-4 md:py-3">
        <Link
          href="/"
          aria-label="Back to notebooks"
          title="Back to notebooks"
          className="flex max-md:min-h-11 max-md:min-w-11 items-center justify-center rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
        >
          <span aria-hidden className="max-md:hidden">←</span>
          <BackIcon className="md:hidden" />
        </Link>
        <span aria-hidden className="text-xl">
          {data.notebook.emoji}
        </span>
        <h1 className="sr-only">{data.notebook.title}</h1>
        <input
          className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none transition hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-well max-md:min-h-11 md:min-w-[11rem] md:basis-[11rem]"
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
            : `Using ${selectedIds.length} of ${sources.length} source${sources.length === 1 ? "" : "s"}${data.notebook.liveLearn ? " + live Learn" : ""}`}
        </span>
        <div className="flex shrink-0 items-center gap-1 md:hidden">
          <button
            ref={mobileAddButton}
            type="button"
            className="btn !min-h-11 !min-w-11 shrink-0 !px-2.5"
            aria-controls="sources-panel"
            aria-expanded={sourcesVisible}
            aria-label="Add sources"
            title="Add sources"
            onClick={showSources}
          >
            <AddSourceIcon />
          </button>
          <OverflowMenu label="More actions" items={moreItems} />
        </div>
        <div className="ml-auto hidden max-w-full shrink-0 flex-wrap items-center gap-3 md:flex">
          <button
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            aria-controls="sources-panel"
            aria-expanded={sourcesVisible}
            title="View added sources and their synopses"
            onClick={viewSources}
          >
            Sources ({sources.length})
          </button>
          <button
            ref={sourcesButton}
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            aria-controls="sources-panel"
            aria-expanded={sourcesVisible}
            onClick={showSources}
          >
            Add sources
          </button>
          <Link
            href={`/search?notebookId=${notebookId}`}
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            title="Search and ask across all notebooks"
            aria-label="Search"
          >
            <SearchIcon width={14} height={14} /> Search
          </Link>
          <button
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            onClick={() => setHelperOpen(true)}
            title="Share an app and get coached through it step by step"
            aria-label="Screen helper"
          >
            <ScreenIcon width={14} height={14} /> Screen helper
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
          >
            <ModelIcon width={14} height={14} />{" "}
            <span className="sr-only">{model ? "Models (chat: " : "Models"}</span>
            <span className="max-w-[10rem] truncate">{model}</span>
            {model ? <span className="sr-only">)</span> : null}
          </button>
          <ThemeToggle />
          <button
            aria-label="Help and about"
            title="Help & about"
            className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
            onClick={() => setAboutOpen(true)}
          >
            <HelpIcon width={14} height={14} /> Help
          </button>
        </div>
      </header>


      {!providerReady && (
        <p
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-900/50 bg-amber-950/25 px-4 py-2 text-[13px] text-amber-100"
        >
          <span>No model provider is set up, so chat and Studio cannot answer yet.</span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-white"
            onClick={() => setPickingModel(true)}
          >
            Show me how to set one up
          </button>
        </p>
      )}

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
        className="flex shrink-0 gap-1 border-b border-[var(--border)] px-2 py-1 lg:hidden"
      >
        {(["sources", "chat", "studio", "notes"] as Tab[]).map((t) => (
          <button
            key={t}
            aria-controls={t === "sources" ? "sources-panel" : undefined}
            onClick={() => {
              if (t === "sources") {
                if (sources.length) viewSources();
                else showSources();
              } else {
                setTab(t);
                setSourcesOpen(false);
              }
            }}
            aria-pressed={tab === t}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap capitalize transition ${
              tab === t
                ? "bg-hover font-medium text-[var(--fg)] shadow-[inset_0_-2px_0_var(--accent)]"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {t}
            {t === "sources" && sources.length ? (
              <span className="text-[11px]">
                <span aria-hidden>
                  {selectedIds.length}/{sources.length}
                </span>
                <span className="sr-only">
                  , {selectedIds.length} of {sources.length} in use
                </span>
              </span>
            ) : null}
            {t === "notes" && notes.length ? (
              <span className="text-[11px]">{notes.length}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <main data-right-panel={right} className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] ${
        sourcesVisible
          ? "lg:grid-cols-[17rem_minmax(0,1fr)_20rem] xl:grid-cols-[320px_minmax(0,1fr)_380px]"
          : "lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_380px]"
      }`}>
        <div
          ref={sourcesPanel}
          id="sources-panel"
          className={`min-h-0 border-[var(--border)] lg:border-r ${
            tab === "sources" ? "block" : "hidden"
          } ${sourcesVisible ? "lg:block" : "lg:hidden"}`}
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
            onSelectMany={(ids, only) => setSelected((prev) => new Set(only ? ids : [...prev, ...ids]))}
            onOpen={(id) => openSource(id)}
            onRemove={(s) => deferRemove(s.id, `Source “${s.title}”`, `/api/sources/${s.id}`)}
            onRemoveMany={deferRemoveMany}
            onChanged={() => void load()}
            onDiscover={() => setDiscovering(true)}
            onLearn={() => setLearning(true)}
            liveLearn={data.notebook.liveLearn}
            onBrowse={() => setBrowsing(true)}
            onLibrary={() => setPickingLibrary(true)}
            addRef={addSources}
            pinned={sourcesPinned}
            adding={sourceAdding}
            onToggleAdding={() => sourceAdding ? viewSources() : showSources()}
            onTogglePin={() => {
              setSourcesOpen(true);
              setSourcesPinned((pinned) => !pinned);
            }}
            onClose={closeSources}
            onDropped={viewSources}
          />
        </div>

        <div className={`min-h-0 lg:block ${tab === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            notebookId={notebookId}
            sources={sources}
            selectedIds={selectedIds}
            liveLearn={data.notebook.liveLearn}
            initialMessages={data.messages}
            sessions={data.sessions ?? []}
            onNoteSaved={() => void load()}
            onAddSources={showSources}
            onChooseSources={chooseSources}
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
              onShowSources={sources.length > 0 ? chooseSources : showSources}
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
              const updated = (await res.json()) as Artifact;
              // A preparation request can finish after its editor was closed.
              // Refresh only the same still-open artifact; never reopen it.
              setOpenArtifact((current) => current?.id === updated.id ? updated : current);
            } catch {
              // Polled in the background; a dropped request is not an error
              // worth showing, and the next tick will pick it up.
            }
          }}
          onRegenerated={async (made) => {
            await load();
            setOpenArtifact(made);
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
      {learning && (
        <DiscoverModal
          notebookId={notebookId}
          provider="microsoft-learn"
          liveLearn={data.notebook.liveLearn}
          onLiveLearnChange={async (enabled) => {
            const response = await fetch(`/api/notebooks/${notebookId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ liveLearn: enabled }),
            });
            if (!response.ok) {
              const reply = await response.json();
              throw new Error(reply.error || "Could not save the live Learn setting.");
            }
            ++loadSeq.current;
            setData((current) => current ? { ...current, notebook: { ...current.notebook, liveLearn: enabled } } : current);
            await load();
          }}
          onClose={() => setLearning(false)}
          onAdd={(hits) => addSources.current?.(hits)}
        />
      )}
      {learnCitation && <LearnCitationModal citation={learnCitation} onClose={() => setLearnCitation(null)} />}
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
      {aboutOpen && (
        <AboutModal
          onClose={() => setAboutOpen(false)}
          onShortcuts={() => {
            setAboutOpen(false);
            setShortcutsOpen(true);
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
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
