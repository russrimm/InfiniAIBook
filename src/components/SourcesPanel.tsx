"use client";

import { useRef, useState } from "react";
import type { Source } from "@/lib/types";

const ICONS: Record<string, string> = {
  pdf: "📕",
  docx: "📘",
  url: "🌐",
  html: "🌐",
  text: "📝",
  md: "📝",
  txt: "📄",
  csv: "📊",
  json: "🔧",
};

function bytes(n: number) {
  if (n < 1000) return `${n} chars`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${(n / 1_000_000).toFixed(1)}M chars`;
}

export default function SourcesPanel({
  notebookId,
  sources,
  selected,
  allSelected,
  onToggle,
  onToggleAll,
  onOpen,
  onChanged,
}: {
  notebookId: string;
  sources: Source[];
  selected: Set<string>;
  allSelected: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "url" | "text">("none");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [dragging, setDragging] = useState(false);

  const post = async (init: RequestInit, label: string) => {
    setBusy(label);
    setErr(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        ...init,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      if (json.errors?.length) setErr(json.errors.join("; "));
      if (json.warnings?.length) setWarn(json.warnings.join(" "));
      else setWarn(null);
      await onChanged();
      setMode("none");
      setUrlValue("");
      setTextValue("");
      setTextTitle("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  };

  const uploadFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));
    void post({ body: fd }, `Reading ${list.length} file${list.length > 1 ? "s" : ""}…`);
  };

  const remove = async (id: string) => {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    await onChanged();
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[var(--panel)]">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-sm font-semibold tracking-wide">Sources</h2>
        {sources.length > 0 && (
          <button
            className="text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
            onClick={onToggleAll}
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      <div className="px-4 pb-3">
        <div
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
          className={`cursor-pointer rounded-xl border border-dashed px-4 py-5 text-center transition ${
            dragging
              ? "border-[var(--accent)] bg-[rgba(124,140,255,0.06)]"
              : "border-[var(--border)] hover:border-[#39424f] hover:bg-[#161a21]"
          }`}
        >
          <div className="mb-1 text-lg">📎</div>
          <p className="text-xs font-medium">Drop files or click to upload</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            PDF · DOCX · TXT · MD · CSV · HTML
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
          onChange={(e) => {
            if (e.target.files) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "url" ? "none" : "url")}
          >
            🌐 Link
          </button>
          <button
            className="btn !px-2 !py-1.5 !text-xs"
            onClick={() => setMode(mode === "text" ? "none" : "text")}
          >
            📝 Paste
          </button>
        </div>

        {mode === "url" && (
          <form
            className="fade-up mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!urlValue.trim()) return;
              void post(
                {
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ url: urlValue.trim() }),
                },
                "Fetching page…"
              );
            }}
          >
            <input
              className="input"
              placeholder="https://example.com/article"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary !px-3" disabled={!!busy}>
              Add
            </button>
          </form>
        )}

        {mode === "text" && (
          <form
            className="fade-up mt-2 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!textValue.trim()) return;
              void post(
                {
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    text: textValue,
                    title: textTitle.trim() || "Pasted text",
                  }),
                },
                "Adding text…"
              );
            }}
          >
            <input
              className="input"
              placeholder="Title (optional)"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
            />
            <textarea
              className="input h-28 resize-none"
              placeholder="Paste your text here…"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              autoFocus
            />
            <button className="btn btn-primary w-full" disabled={!!busy}>
              Add source
            </button>
          </form>
        )}

        {busy && (
          <p className="mt-2 animate-pulse text-xs text-[var(--accent)]">{busy}</p>
        )}
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        {warn && (
          <p className="mt-2 text-xs leading-snug text-amber-400/90">{warn}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {sources.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-[var(--muted)]">
            No sources yet. Everything you generate is grounded in what you add here.
          </p>
        ) : (
          <ul className="space-y-1">
            {sources.map((s) => (
              <li
                key={s.id}
                className={`group flex gap-2.5 rounded-xl border px-2.5 py-2.5 transition ${
                  selected.has(s.id)
                    ? "border-[#2f3846] bg-[#171b21]"
                    : "border-transparent opacity-55 hover:opacity-90"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                  checked={selected.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onOpen(s.id)}
                >
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-sm">{ICONS[s.kind] ?? "📄"}</span>
                    <span className="line-clamp-2 text-[13px] leading-snug font-medium">
                      {s.title}
                    </span>
                  </div>
                  {s.summary && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                      {s.summary}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-[#6b7482]">{bytes(s.chars)}</p>
                </button>
                <button
                  aria-label="Remove source"
                  className="h-fit shrink-0 rounded px-1 text-xs text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                  onClick={() => void remove(s.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
