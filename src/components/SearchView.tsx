"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Markdown from "./Markdown";

type Hit = {
  id: string;
  notebookId: string;
  notebookTitle: string;
  sourceId: string;
  sourceTitle: string;
  part: number;
  snippet: string;
  score: number;
};
type NoteHit = {
  id: string;
  notebookId: string;
  notebookTitle: string;
  title: string;
  kind: string;
  snippet: string;
};
type AskCitation = {
  n: number;
  notebookId: string;
  notebookTitle: string;
  sourceId: string;
  sourceTitle: string;
  part: number;
  snippet: string;
};

/** Search passages and notes across every notebook, or ask them one question. */
export default function SearchView({
  initialQuery,
  notebookId,
}: {
  initialQuery: string;
  notebookId?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [mode, setMode] = useState<"text" | "vector">("text");
  const [scoped, setScoped] = useState(Boolean(notebookId));
  const [busy, setBusy] = useState<"search" | "ask" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ hits: Hit[]; notes: NoteHit[]; semantic: boolean } | null>(
    null
  );
  const [answer, setAnswer] = useState<{ answer: string; citations: AskCitation[] } | null>(null);

  const scope = scoped && notebookId ? notebookId : undefined;

  const search = async (query = q) => {
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setAnswer(null);
    try {
      const params = new URLSearchParams({ q: query, mode });
      if (scope) params.set("notebookId", scope);
      const res = await fetch(`/api/search?${params}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setResults(j);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Search failed.");
    } finally {
      setBusy(null);
    }
  };

  const ask = async () => {
    if (!q.trim()) return;
    setBusy("ask");
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/search/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, notebookId: scope }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setAnswer(j);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Could not answer that.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (initialQuery) void search(initialQuery);
    // Run once for a query carried in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href={notebookId ? `/notebook/${notebookId}` : "/"}
          className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] transition hover:bg-[#1e2430] hover:text-[var(--fg)]"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Search your library</h1>
      </header>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          className="input min-w-0 flex-1"
          placeholder="Search passages and notes, or ask a question…"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-primary" disabled={!!busy || !q.trim()}>
          {busy === "search" ? "Searching…" : "Search"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!!busy || !q.trim()}
          onClick={() => void ask()}
          title="Get one grounded answer drawn from all matching sources"
        >
          {busy === "ask" ? "Thinking…" : "✨ Ask"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-[var(--muted)]">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "text"}
            onChange={() => setMode("text")}
          />
          Keyword
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={mode === "vector"}
            onChange={() => setMode("vector")}
          />
          Semantic
        </label>
        {notebookId && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} />
            Only this notebook
          </label>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {answer && (
        <section className="card fade-up mt-6 px-5 py-4">
          <Markdown
            citations={answer.citations.map((c) => ({
              n: c.n,
              sourceId: c.sourceId,
              sourceTitle: `${c.sourceTitle} (${c.notebookTitle})`,
              part: c.part,
              snippet: c.snippet,
            }))}
          >
            {answer.answer}
          </Markdown>
          {answer.citations.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-[var(--border)] pt-3">
              {answer.citations.map((c) => (
                <li key={c.n} className="flex items-center gap-2 text-[12px]">
                  <span className="cite">{c.n}</span>
                  <Link className="truncate hover:underline" href={`/notebook/${c.notebookId}`}>
                    {c.sourceTitle}
                  </Link>
                  <span className="shrink-0 text-[11px] text-[#6b7482]">
                    {c.notebookTitle} · part {c.part}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {results && (
        <div className="fade-up mt-6 space-y-8">
          {mode === "vector" && !results.semantic && (
            <p className="text-[12px] text-amber-200/90">
              Semantic search is unavailable (no embedding model reachable), so these are keyword
              results.
            </p>
          )}
          {results.notes.length > 0 && (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--muted)] uppercase">
                Notes · {results.notes.length}
              </h2>
              <ul className="space-y-2">
                {results.notes.map((n) => (
                  <li key={n.id} className="card px-4 py-3">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span>{n.kind === "ai" ? "✨" : "🗒️"}</span>
                      <Link className="font-medium hover:underline" href={`/notebook/${n.notebookId}`}>
                        {n.title}
                      </Link>
                      <span className="text-[11px] text-[#6b7482]">{n.notebookTitle}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[12px] text-[var(--muted)]">{n.snippet}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--muted)] uppercase">
              Source passages · {results.hits.length}
            </h2>
            {results.hits.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No passages match.</p>
            ) : (
              <ul className="space-y-2">
                {results.hits.map((h) => (
                  <li key={h.id} className="card px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Link className="font-medium hover:underline" href={`/notebook/${h.notebookId}`}>
                        {h.sourceTitle}
                      </Link>
                      <span className="text-[11px] text-[#6b7482]">
                        {h.notebookTitle} · part {h.part}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-4 text-[12px] leading-relaxed text-[var(--muted)]">
                      {h.snippet}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
