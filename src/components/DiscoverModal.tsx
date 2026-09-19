"use client";

import { useEffect, useRef, useState } from "react";

export type DiscoverHit = {
  title: string;
  url: string;
  snippet: string;
  host: string;
  provider: string;
  added?: boolean;
  reachable?: boolean;
};

const SUGGESTIONS = [
  "CRISPR gene editing ethics",
  "remote work productivity research",
  "solid state battery breakthroughs",
];

export default function DiscoverModal({
  notebookId,
  onClose,
  onAdd,
}: {
  notebookId: string;
  onClose: () => void;
  onAdd: (hits: DiscoverHit[]) => void;
}) {
  const [topic, setTopic] = useState("");
  const [results, setResults] = useState<DiscoverHit[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const search = async (q: string) => {
    const query = q.trim();
    if (!query || loading) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setChosen(new Set());
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notebookId, topic: query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setResults(json.results as DiscoverHit[]);
      setQueries(json.queries ?? []);
      // Pre-select the strongest handful that will actually ingest; the user
      // prunes from there and can still opt into the blocked ones.
      setChosen(
        new Set(
          (json.results as DiscoverHit[])
            .filter((r) => !r.added && r.reachable !== false)
            .slice(0, 5)
            .map((r) => r.url)
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const selectable = (results ?? []).filter((r) => !r.added);
  const allChosen = selectable.length > 0 && chosen.size === selectable.length;
  const blockedCount = selectable.filter((r) => r.reachable === false).length;

  const toggle = (url: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const confirm = () => {
    const picked = (results ?? []).filter((r) => chosen.has(r.url));
    if (picked.length) onAdd(picked);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:h-[min(80vh,46rem)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-[var(--border)] px-5 py-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-lg">🔎</span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold">Discover sources</h2>
              <p className="text-[11px] text-[var(--muted)]">
                Describe a topic and pick the pages worth adding.
              </p>
            </div>
            <button
              aria-label="Close"
              className="btn !px-2.5 !py-1.5 !text-xs"
              onClick={onClose}
            >
              ✕
            </button>
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search(topic);
            }}
          >
            <input
              ref={inputRef}
              className="input"
              placeholder="e.g. how mRNA vaccines were developed"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <button className="btn btn-primary !px-4" disabled={loading || !topic.trim()}>
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {queries.length > 1 && !loading && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Searched: {queries.map((q) => `“${q}”`).join(" · ")}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!results && !loading && !error && (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--muted)]">
                Search the web for pages about a topic, then choose which to add.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="btn !px-3 !py-1.5 !text-xs"
                    onClick={() => {
                      setTopic(s);
                      void search(s);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <ul className="space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="card shimmer h-20" />
              ))}
            </ul>
          )}

          {error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {results && results.length === 0 && !loading && (
            <p className="py-10 text-center text-sm text-[var(--muted)]">
              Nothing found for that topic. Try different wording.
            </p>
          )}

          {results && results.length > 0 && (
            <ul className="space-y-2">
              {results.map((r) => {
                const isChosen = chosen.has(r.url);
                return (
                  <li key={r.url}>
                    <label
                      className={`flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition ${
                        r.added
                          ? "cursor-default border-[var(--border)] opacity-45"
                          : isChosen
                            ? "border-[var(--accent)] bg-[#1b2030]"
                            : "border-[var(--border)] hover:border-[#39424f] hover:bg-[#171b21]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                        checked={isChosen}
                        disabled={r.added}
                        onChange={() => toggle(r.url)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] leading-snug font-medium">
                          {r.title}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-[11px] text-[#8f9dff]">
                            {r.host}
                          </span>
                          {r.added && (
                            <span className="rounded bg-[#1e2430] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                              already added
                            </span>
                          )}
                          {!r.added && r.reachable === false && (
                            <span
                              className="rounded bg-amber-950/50 px-1.5 py-0.5 text-[10px] text-amber-300/90"
                              title="This site refused an automated request, so importing it will probably fail."
                            >
                              may block import
                            </span>
                          )}
                        </span>
                        {r.snippet && (
                          <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-[var(--muted)]">
                            {r.snippet}
                          </span>
                        )}
                      </span>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="h-fit shrink-0 rounded px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[#1e2430] hover:text-[var(--fg)]"
                        title="Open in a new tab"
                      >
                        ↗
                      </a>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {results && selectable.length > 0 && (
          <footer className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] px-5 py-3">
            <button
              className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
              onClick={() =>
                setChosen(allChosen ? new Set() : new Set(selectable.map((r) => r.url)))
              }
            >
              {allChosen ? "Clear selection" : `Select all ${selectable.length}`}
            </button>
            {blockedCount > 0 && (
              <span className="text-[11px] text-amber-300/80">
                {blockedCount} may block import
              </span>
            )}
            <span className="ml-auto text-xs text-[var(--muted)]">
              {chosen.size} selected
            </span>
            <button
              className="btn btn-primary"
              disabled={chosen.size === 0}
              onClick={confirm}
            >
              Add {chosen.size || ""} source{chosen.size === 1 ? "" : "s"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
