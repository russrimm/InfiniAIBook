"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Loaded =
  | {
      frameable: true;
      url: string;
      status: number;
      alreadyAdded: boolean;
    }
  | {
      frameable: false;
      url: string;
      reason: string;
      status: number;
      contentType?: string;
      title: string;
      text: string;
      chars: number;
      links: { href: string; text: string }[];
      extractError: string | null;
      alreadyAdded: boolean;
    };

const shortUrl = (u: string) => {
  try {
    const p = new URL(u);
    return p.hostname.replace(/^www\./, "") + (p.pathname === "/" ? "" : p.pathname);
  } catch {
    return u;
  }
};

export default function BrowserModal({
  notebookId,
  initialUrl,
  onClose,
  onAdded,
}: {
  notebookId: string;
  initialUrl?: string;
  onClose: () => void;
  /** Called after a page is queued for indexing, so the source list refreshes. */
  onAdded: () => Promise<void> | void;
}) {
  const [input, setInput] = useState(initialUrl ?? "");
  const [page, setPage] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  /** Pages visited in this session, so Back works in the reader view. */
  const history = useRef<string[]>([]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const load = useCallback(
    async (raw: string, pushHistory = true) => {
      const url = raw.trim();
      if (!url) return;
      setLoading(true);
      setError(null);
      setAdded(null);
      try {
        const res = await fetch(
          `/api/browse?url=${encodeURIComponent(url)}&notebookId=${notebookId}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load that page.");
        if (pushHistory && page) history.current.push(page.url);
        setPage(json as Loaded);
        setInput((json as Loaded).url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load that page.");
        setPage(null);
      } finally {
        setLoading(false);
      }
    },
    [notebookId, page]
  );

  useEffect(() => {
    if (initialUrl) void load(initialUrl, false);
    // Only on first mount; later loads come from the address bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!page) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: page.url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add that page.");
      const first = (json.added ?? [])[0] as { title?: string; chars?: number } | undefined;
      setAdded(
        first
          ? `Added “${first.title}” — ${(first.chars ?? 0).toLocaleString()} characters indexed.`
          : "Added to sources."
      );
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that page.");
    } finally {
      setAdding(false);
    }
  };

  const back = () => {
    const prev = history.current.pop();
    if (prev) void load(prev, false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-6xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <button
            className="btn !px-2.5 !py-1.5 !text-xs disabled:opacity-40"
            onClick={back}
            disabled={history.current.length === 0}
            aria-label="Back"
          >
            ←
          </button>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void load(input);
            }}
          >
            <input
              className="input !py-1.5 min-w-0 flex-1 !text-[12px]"
              placeholder="Paste or type a web address"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
            />
            <button className="btn !px-3 !py-1.5 !text-xs" type="submit" disabled={loading}>
              {loading ? "Loading…" : "Go"}
            </button>
          </form>
          <button
            className="btn btn-primary !px-3 !py-1.5 !text-xs disabled:opacity-40"
            onClick={() => void add()}
            disabled={!page || adding || loading}
          >
            {adding ? "Adding…" : page?.alreadyAdded ? "Add again" : "Add to sources"}
          </button>
          <button
            aria-label="Close"
            className="btn !px-2.5 !py-1.5 !text-xs"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        {(error || added || page?.alreadyAdded) && (
          <div className="shrink-0 border-b border-[var(--border)] px-4 py-2 text-[11px]">
            {error && <p className="text-red-300">{error}</p>}
            {added && <p className="text-emerald-300">{added}</p>}
            {!error && !added && page?.alreadyAdded && (
              <p className="text-[var(--muted)]">
                This page is already a source in this notebook.
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          {!page && !loading && (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div className="max-w-md">
                <p className="text-[15px] font-medium">Browse, then keep what is useful</p>
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
                  Pages that allow embedding open as they really are. Roughly half of
                  sites refuse to be framed — those open in a reader view built by the
                  same extractor that indexing uses, so what you see is what would be
                  stored.
                </p>
              </div>
            </div>
          )}

          {loading && !page && (
            <div className="h-full p-6">
              <div className="card shimmer h-full" />
            </div>
          )}

          {page?.frameable && (
            <iframe
              key={page.url}
              src={page.url}
              title="Browser"
              className="h-full w-full border-0 bg-white"
              // The page is untrusted third-party HTML. Scripts are allowed so
              // it renders as intended, but it gets no access to this document.
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              referrerPolicy="no-referrer"
            />
          )}

          {page && !page.frameable && (
            <div className="h-full overflow-y-auto px-6 py-5 sm:px-10">
              <div className="mx-auto max-w-3xl">
                <p className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2 text-[11px] leading-snug text-amber-200/90">
                  Showing the reader view because {page.reason}. This is exactly the
                  text that would be indexed.
                </p>

                <h1 className="text-[22px] leading-tight font-semibold">
                  {page.title || shortUrl(page.url)}
                </h1>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-[11px] text-[var(--muted)] underline decoration-dotted hover:text-[var(--fg)]"
                >
                  {page.url} · opens in a real tab
                </a>

                {page.extractError ? (
                  <p className="mt-5 rounded-lg border border-red-900/50 bg-red-950/20 px-3 py-2 text-[12px] text-red-200">
                    {page.extractError}
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {page.chars.toLocaleString()} characters
                      {page.contentType ? ` · ${page.contentType}` : ""}
                    </p>
                    <article className="mt-5 text-[14px] leading-relaxed whitespace-pre-wrap text-[#c9d2dd]">
                      {page.text}
                    </article>
                  </>
                )}

                {page.links.length > 0 && (
                  <div className="mt-8 border-t border-[var(--border)] pt-4">
                    <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-[var(--muted)] uppercase">
                      Links on this page
                    </h2>
                    <ul className="space-y-1">
                      {page.links.map((l, i) => (
                        <li key={i}>
                          <button
                            className="w-full truncate text-left text-[12px] text-[#8f9dff] transition hover:underline"
                            onClick={() => void load(l.href)}
                          >
                            {l.text}
                            <span className="ml-2 text-[10px] text-[var(--muted)]">
                              {shortUrl(l.href)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
