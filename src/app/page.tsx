"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Notebook } from "@/lib/types";
import AboutModal from "@/components/AboutModal";
import ScreenHelperModal from "@/components/ScreenHelperModal";
import BackupModal from "@/components/BackupModal";
import { SUBLINE, TAGLINE } from "@/lib/brand";
import ThemeToggle from "@/components/ThemeToggle";
import { useConfirm } from "@/components/ConfirmDialog";
import { useDeferredDelete } from "@/components/UndoToast";
import NotebookList from "@/components/NotebookList";

export default function Home() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [authOn, setAuthOn] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const deferDelete = useDeferredDelete();
  const askConfirm = useConfirm();
  /** Notebooks deleted but still within their undo window. */
  const [hiddenNb, setHiddenNb] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      const res = await fetch("/api/notebooks");
      if (!res.ok) throw new Error(String(res.status));
      setNotebooks(await res.json());
      setLoadError(false);
    } catch {
      // An unreachable server is not "no notebooks yet"; say so and offer a retry.
      setLoadError(true);
    }
  };

  useEffect(() => {
    void load();
    void fetch("/api/auth/status")
      .then((r) => (r.ok ? r.json() : { auth: false }))
      .then((j: { auth?: boolean }) => setAuthOn(!!j.auth))
      .catch(() => {});
  }, []);

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    // A full reload clears all client state when signing out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  };

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !j.id) throw new Error(j.error);
      router.push(`/notebook/${j.id}`);
    } catch (e) {
      setCreateError(
        e instanceof Error && e.message
          ? e.message
          : "Could not create a notebook. Try again.",
      );
      setCreating(false);
    }
  };

  const importNotebook = async (file: File) => {
    setImporting(true);
    setCreateError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/notebooks/import", {
        method: "POST",
        body,
      });
      const j = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !j.id) throw new Error(j.error);
      router.push(`/notebook/${j.id}`);
    } catch (e) {
      setCreateError(
        e instanceof Error && e.message
          ? e.message
          : "Could not import that notebook.",
      );
      setImporting(false);
    }
  };

  const remove = async (id: string, title: string) => {
    const ok = await askConfirm({
      title: "Delete this notebook?",
      message: `“${title}” and all its sources, chats, notes and generated items will be deleted. You can undo this for a few seconds.`,
      confirmLabel: "Delete notebook",
      destructive: true,
    });
    if (!ok) return;
    setHiddenNb((h) => new Set(h).add(id));
    const unhide = () =>
      setHiddenNb((h) => {
        const next = new Set(h);
        next.delete(id);
        return next;
      });
    deferDelete({
      label: `Notebook “${title}”`,
      url: `/api/notebooks/${id}`,
      onUndo: unhide,
      onCommitted: async () => {
        await load();
        unhide();
      },
    });
  };

  const visible = notebooks?.filter((n) => !hiddenNb.has(n.id)) ?? null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-14">
      <nav
        aria-label="Primary"
        className="mb-14 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="shrink-0 text-lg font-semibold tracking-tight">InfiniAIBook</div>
        <div className="-mx-3 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] sm:mx-0 sm:justify-end">
          <Link
            href="/search"
            className="rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
          >
            <span aria-hidden>🔎</span> Search all
          </Link>
          <button
            className="rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
            onClick={() => setHelperOpen(true)}
            title="Share an app and get coached through it step by step"
          >
            <span aria-hidden>🖥️</span> Screen helper
          </button>
          <button
            className="rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
            onClick={() => setBackupOpen(true)}
            title="Download everything as one ZIP, or restore from one"
          >
            <span aria-hidden>💾</span> Backup
          </button>
          <button
            aria-label="Help and about"
            title="Help & about"
            className="rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
            onClick={() => setAboutOpen(true)}
          >
            <span aria-hidden>?</span> Help
          </button>
          <ThemeToggle variant="nav" />
          {authOn && (
            <button
              className="rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          )}
        </div>
      </nav>

      <header className="mb-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8 lg:gap-10">
          {/* The mark is sized to the title and sub-line beside it. Its box is
              fixed at every breakpoint, so nothing shifts when it loads. */}
          <Image
            src="/brand/infiniaibook-mark.png"
            alt=""
            width={512}
            height={512}
            sizes="(min-width: 1024px) 160px, (min-width: 640px) 128px, 64px"
            priority
            unoptimized
            data-testid="hero-logo"
            className="h-16 w-16 shrink-0 sm:h-32 sm:w-32 lg:h-40 lg:w-40"
          />
          <div className="max-w-2xl">
            <div className="mb-3 text-xs font-medium tracking-widest text-[var(--muted)] uppercase">
              Self-hosted research notebook
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {TAGLINE}
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
              {SUBLINE}
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={create}
            disabled={creating}
          >
            {creating ? "Creating…" : "+ New notebook"}
          </button>
          <button
            className="btn"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            title="Restore a notebook exported from this app"
          >
            {importing ? "Importing…" : "Import a notebook"}
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            aria-label="Import a notebook export"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importNotebook(file);
            }}
          />
        </div>
      </header>

      {createError && (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"
        >
          {createError}
        </p>
      )}

      {loadError && visible === null ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-4 rounded-xl border border-red-900/60 bg-red-950/30 px-6 py-12 text-center"
        >
          <p className="text-sm text-red-300">
            Your notebooks could not be loaded. Check that the server is
            running.
          </p>
          <button className="btn" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : visible === null ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          <span className="sr-only" role="status">
            Loading notebooks…
          </span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="card shimmer h-36" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-20 text-center">
          <div aria-hidden className="text-5xl">
            📚
          </div>
          <h2 className="text-lg font-medium">No notebooks yet</h2>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            A notebook holds a set of sources — PDFs, docs, web pages or pasted
            text — and everything you generate from them.
          </p>
          <ol className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
            {[
              [
                "Add sources",
                "Upload files, add links, paste text or search the web.",
              ],
              [
                "Ask questions",
                "Chat answers only from your sources, with citations.",
              ],
              [
                "Create",
                "Turn them into reports, audio, video, infographics and quizzes.",
              ],
            ].map(([title, body], i) => (
              <li
                key={title}
                className="rounded-xl border border-[var(--border)] px-3 py-2.5"
              >
                <p className="text-[13px] font-medium">
                  <span className="mr-1.5 text-[var(--muted)]">{i + 1}.</span>
                  {title}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
                  {body}
                </p>
              </li>
            ))}
          </ol>
          <button
            className="btn btn-primary"
            onClick={create}
            disabled={creating}
          >
            Create your first notebook
          </button>
        </div>
      ) : (
        <NotebookList
          notebooks={visible}
          onDelete={(id, title) => void remove(id, title)}
          onRenamed={(id, title) =>
            setNotebooks((list) => list?.map((n) => (n.id === id ? { ...n, title } : n)) ?? list)
          }
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {helperOpen && <ScreenHelperModal onClose={() => setHelperOpen(false)} />}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
    </main>
  );
}
