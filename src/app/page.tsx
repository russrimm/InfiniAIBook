"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Notebook } from "@/lib/types";
import AboutModal from "@/components/AboutModal";
import ScreenHelperModal from "@/components/ScreenHelperModal";
import { useDeferredDelete } from "@/components/UndoToast";

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
  const deferDelete = useDeferredDelete();
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

  const remove = (id: string, title: string) => {
    if (
      !window.confirm(
        `Delete “${title}” and everything in it? You can undo this for a few seconds.`,
      )
    ) {
      return;
    }
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
        className="mb-14 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
          />
          InfiniAIBook
        </div>
        <div className="flex items-center gap-1 text-[13px]">
          <Link
            href="/search"
            className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-hover hover:text-[var(--foreground)]"
          >
            <span aria-hidden>🔎</span> Search all
          </Link>
          <button
            className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-hover hover:text-[var(--foreground)]"
            onClick={() => setHelperOpen(true)}
            title="Share an app and get coached through it step by step"
          >
            <span aria-hidden>🖥️</span> Screen helper
          </button>
          <button
            aria-label="Help and about"
            title="Help & about"
            className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-hover hover:text-[var(--foreground)]"
            onClick={() => setAboutOpen(true)}
          >
            <span aria-hidden>?</span> Help
          </button>
          {authOn && (
            <button
              className="rounded-lg px-3 py-1.5 text-[var(--muted)] transition hover:bg-hover hover:text-[var(--foreground)]"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          )}
        </div>
      </nav>

      <header className="mb-14 max-w-2xl">
        <div className="mb-3 text-xs font-medium tracking-widest text-[var(--muted)] uppercase">
          Grounded research studio
        </div>
        <h1 className="text-5xl font-semibold tracking-tight">
          Research that shows its work.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
          Upload your sources. Ask them anything. Turn them into reports,
          quizzes, mind maps and infographics — every claim cited back to your
          documents.
        </p>
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
        <section aria-labelledby="nb-heading">
          \n{" "}
          <h2
            id="nb-heading"
            className="mb-4 text-sm font-medium text-[var(--muted)]"
          >
            \n Your notebooks · {visible.length}\n{" "}
          </h2>
          \n{" "}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((n) => (
              <li
                key={n.id}
                className="card fade-up group relative p-5 transition focus-within:border-line-hover hover:border-line-hover"
              >
                <div aria-hidden className="mb-4 text-3xl">
                  {n.emoji}
                </div>
                <h2 className="mb-1 line-clamp-2 pr-14 font-medium">
                  {/* The link's overlay makes the whole card the target, while the
                    delete button stays a separate control rather than nested. */}
                  <Link
                    href={`/notebook/${n.id}`}
                    className="rounded outline-none after:absolute after:inset-0 after:rounded-[14px] after:content-[''] focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--accent)]"
                  >
                    {n.title}
                  </Link>
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {n.sourceCount ?? 0} source{n.sourceCount === 1 ? "" : "s"} ·
                  Created{" "}
                  {new Date(n.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <button
                  aria-label={`Delete notebook ${n.title}`}
                  className="reveal absolute top-3 right-3 z-10 rounded-lg px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-hover hover:text-red-400"
                  onClick={() => remove(n.id, n.title)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      {helperOpen && <ScreenHelperModal onClose={() => setHelperOpen(false)} />}
    </main>
  );
}
