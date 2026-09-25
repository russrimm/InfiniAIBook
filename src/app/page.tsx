"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notebook } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const res = await fetch("/api/notebooks");
    setNotebooks(res.ok ? await res.json() : []);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setCreating(true);
    const res = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await res.json();
    router.push(`/notebook/${id}`);
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}" and all of its sources?`)) return;
    await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
    void load();
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-14">
      <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium tracking-widest text-[var(--muted)] uppercase">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />
            Grounded research studio
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">InfiniAIBook</h1>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--muted)]">
            Upload your sources. Ask them anything. Turn them into reports, quizzes,
            mind maps and infographics — every claim cited back to your documents.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => router.push("/search")}>
            🔎 Search all
          </button>
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            {creating ? "Creating…" : "+ New notebook"}
          </button>
        </div>
      </header>

      {notebooks === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card shimmer h-36" />
          ))}
        </div>
      ) : notebooks.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-20 text-center">
          <div className="text-5xl">📚</div>
          <h2 className="text-lg font-medium">No notebooks yet</h2>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            A notebook holds a set of sources — PDFs, docs, web pages or pasted text —
            and everything you generate from them.
          </p>
          <button className="btn btn-primary" onClick={create} disabled={creating}>
            Create your first notebook
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notebooks.map((n) => (
            <div
              key={n.id}
              className="card fade-up group relative cursor-pointer p-5 transition hover:border-[#39424f]"
              onClick={() => router.push(`/notebook/${n.id}`)}
            >
              <div className="mb-4 text-3xl">{n.emoji}</div>
              <h3 className="mb-1 line-clamp-2 font-medium">{n.title}</h3>
              <p className="text-xs text-[var(--muted)]">
                {n.sourceCount ?? 0} source{n.sourceCount === 1 ? "" : "s"} ·{" "}
                {new Date(n.createdAt).toLocaleDateString()}
              </p>
              <button
                aria-label="Delete notebook"
                className="absolute top-3 right-3 rounded-lg px-2 py-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:bg-[#1e2430] hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(n.id, n.title);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
