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
import ModelPicker from "./ModelPicker";
import type { Artifact, Message, Notebook, Source } from "@/lib/types";

type Data = {
  notebook: Notebook;
  sources: Source[];
  artifacts: Artifact[];
  messages: Message[];
};

type Tab = "sources" | "chat" | "studio";

export default function Workspace({ notebookId }: { notebookId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [pickingModel, setPickingModel] = useState(false);
  const [model, setModel] = useState("");
  const [tab, setTab] = useState<Tab>("chat");
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [showUpdates, setShowUpdates] = useState(false);
  const [checkingSources, setCheckingSources] = useState(false);

  /** Source ids already reflected in `selected`, to detect genuinely new ones. */
  const seenSources = useRef<Set<string>>(new Set());
  /** Guards against an older in-flight load overwriting a newer one. */
  const loadSeq = useRef(0);
  /** Set by SourcesPanel so Discover can queue URLs through the same pipeline. */
  const addSources = useRef<((hits: DiscoverHit[]) => void) | null>(null);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetch(`/api/notebooks/${notebookId}`);
    if (!res.ok) {
      setError("Notebook not found.");
      return;
    }
    const d: Data = await res.json();
    // Uploads finish independently, so several loads can be in flight at once.
    // Only the newest response may touch state, or an older one would drop
    // sources that have since arrived.
    if (seq !== loadSeq.current) return;

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
  }, [notebookId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  // Shown in the header so the active model is visible without opening a dialog.
  const loadModel = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      if (res.ok) setModel((await res.json()).current.chat);
    } catch {
      /* the picker reports failures; the header just stays empty */
    }
  }, []);

  useEffect(() => {
    void loadModel();
  }, [loadModel]);

  const selectedIds = [...selected];
  const allSelected = data ? selected.size === data.sources.length : false;

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
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted)]">
        Loading notebook…
      </div>
    );
  }

  const rename = async (title: string) => {
    setData({ ...data, notebook: { ...data.notebook, title } });
    await fetch(`/api/notebooks/${notebookId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
        <Link
          href="/"
          className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-[#1e2430] hover:text-[var(--fg)]"
        >
          ←
        </Link>
        <span className="text-xl">{data.notebook.emoji}</span>
        <input
          className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-medium outline-none transition hover:border-[var(--border)] focus:border-[var(--border)] focus:bg-[#0e1116]"
          value={data.notebook.title}
          onChange={(e) => void rename(e.target.value)}
        />
        <span className="hidden shrink-0 text-xs text-[var(--muted)] sm:block">
          {checkingSources
            ? "Checking links…"
            : `${selected.size}/${data.sources.length} sources in context`}
        </span>
        <button
          className="btn shrink-0 !px-2.5 !py-1 !text-[11px]"
          onClick={() => setPickingModel(true)}
          title="Choose which models to use"
        >
          🧠 <span className="hidden max-w-[10rem] truncate md:inline">{model}</span>
        </button>
      </header>

      {pendingUpdates.length > 0 && (
        <button
          onClick={() => setShowUpdates(true)}
          className="fade-up flex shrink-0 items-center gap-2 border-b border-amber-900/50 bg-amber-950/25 px-4 py-2 text-left text-[12px] text-amber-100 transition hover:bg-amber-950/40"
        >
          <span>🔄</span>
          <span className="flex-1">
            {pendingUpdates.length} linked source
            {pendingUpdates.length === 1 ? " has" : "s have"} changed since they were
            indexed.
          </span>
          <span className="shrink-0 font-medium underline">Review</span>
        </button>
      )}

      <nav className="flex shrink-0 gap-1 border-b border-[var(--border)] px-3 py-2 lg:hidden">
        {(["sources", "chat", "studio"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              tab === t
                ? "bg-[#1e2430] text-[var(--fg)]"
                : "text-[var(--muted)] hover:text-[var(--fg)]"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <div
          className={`min-h-0 border-[var(--border)] lg:block lg:border-r ${
            tab === "sources" ? "block" : "hidden"
          }`}
        >
          <SourcesPanel
            notebookId={notebookId}
            sources={data.sources}
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
                allSelected ? new Set() : new Set(data.sources.map((s) => s.id))
              )
            }
            onOpen={setOpenSourceId}
            onChanged={load}
            onDiscover={() => setDiscovering(true)}
            addRef={addSources}
          />
        </div>

        <div className={`min-h-0 lg:block ${tab === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            notebookId={notebookId}
            sources={data.sources}
            selectedIds={selectedIds}
            initialMessages={data.messages}
          />
        </div>

        <div
          className={`min-h-0 border-[var(--border)] lg:block lg:border-l ${
            tab === "studio" ? "block" : "hidden"
          }`}
        >
          <StudioPanel
            notebookId={notebookId}
            hasSources={data.sources.length > 0}
            selectedIds={selectedIds}
            artifacts={data.artifacts}
            onOpen={setOpenArtifact}
            onChanged={load}
          />
        </div>
      </div>

      {openArtifact && (
        <ArtifactModal artifact={openArtifact} onClose={() => setOpenArtifact(null)} />
      )}
      {openSourceId && (
        <SourceModal sourceId={openSourceId} onClose={() => setOpenSourceId(null)} />
      )}
      {discovering && (
        <DiscoverModal
          notebookId={notebookId}
          onClose={() => setDiscovering(false)}
          onAdd={(hits) => addSources.current?.(hits)}
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
    </div>
  );
}
