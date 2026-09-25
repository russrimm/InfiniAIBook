"use client";

import { useEffect, useState } from "react";
import Markdown from "./Markdown";
import type { Note } from "@/lib/types";

function when(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotesPanel({
  notebookId,
  notes,
  onChanged,
  openNoteId,
  onOpenNote,
  onManageTransformations,
}: {
  notebookId: string;
  notes: Note[];
  onChanged: () => void;
  /** Controlled so a transformation or saved answer can open its new note. */
  openNoteId: string | null;
  onOpenNote: (id: string | null) => void;
  onManageTransformations: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const open = notes.find((n) => n.id === openNoteId) ?? null;

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-3">
        <h2 className="flex-1 text-[13px] font-semibold tracking-wide text-[var(--muted)] uppercase">
          Notes
        </h2>
        <button
          className="btn !px-2.5 !py-1 !text-[11px]"
          onClick={onManageTransformations}
          title="Reusable prompts you can run on any source"
        >
          ⚙ Transformations
        </button>
        <button className="btn btn-primary !px-2.5 !py-1 !text-[11px]" onClick={() => setCreating(true)}>
          ＋ Note
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {notes.length === 0 ? (
          <div className="card px-4 py-6 text-center text-[12px] leading-relaxed text-[var(--muted)]">
            Write your own notes, save chat answers with <b>Save to notes</b>, or open a
            source and run a transformation on it.
          </div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  className="card w-full px-3 py-2.5 text-left transition hover:border-[#39424f]"
                  onClick={() => onOpenNote(n.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{n.kind === "ai" ? "✨" : "🗒️"}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{n.title}</span>
                    <span className="shrink-0 text-[10px] text-[#6b7482]">{when(n.updatedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--muted)]">
                    {n.content.replace(/[#*_>`-]/g, "").slice(0, 200)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(open || creating) && (
        <NoteEditor
          notebookId={notebookId}
          note={creating ? null : open}
          onClose={() => {
            setCreating(false);
            onOpenNote(null);
          }}
          onChanged={onChanged}
        />
      )}
    </aside>
  );
}

function NoteEditor({
  notebookId,
  note,
  onClose,
  onChanged,
}: {
  notebookId: string;
  note: Note | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [editing, setEditing] = useState(!note);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = !note || title !== note.title || content !== note.content;

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const save = async () => {
    if (!content.trim()) {
      setMessage("A note needs some content.");
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      const res = await fetch(note ? `/api/notes/${note.id}` : `/api/notebooks/${notebookId}/notes`, {
        method: note ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error);
      onChanged();
      onClose();
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : "Could not save the note.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!note || !window.confirm(`Delete "${note.title}"?`)) return;
    setBusy("delete");
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    onChanged();
    onClose();
  };

  // A note becomes a source so chat and the studio can draw on it like any
  // document. The copy is independent; editing the note later does not change it.
  const toSource = async () => {
    setBusy("source");
    setMessage(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: content, title: title || "Note", kind: "note" }),
      });
      const j = (await res.json()) as { errors?: string[]; error?: string };
      if (!res.ok || j.errors?.length) throw new Error(j.errors?.[0] ?? j.error);
      onChanged();
      setMessage("Added to sources.");
    } catch (e) {
      setMessage(e instanceof Error && e.message ? e.message : "Could not add it as a source.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/65 p-0 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="fade-up flex h-full w-full max-w-3xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--panel)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-5 py-3">
          <span>{note?.kind === "ai" ? "✨" : "🗒️"}</span>
          <input
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold outline-none focus:border-[var(--border)]"
            placeholder="Untitled note"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="btn !px-2.5 !py-1 !text-[11px]" onClick={() => setEditing(!editing)}>
            {editing ? "Preview" : "Edit"}
          </button>
          <button aria-label="Close" className="btn !px-2.5 !py-1.5 !text-xs" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {editing ? (
            <textarea
              className="input h-full min-h-[50vh] resize-none font-mono text-[13px] leading-relaxed"
              placeholder="Write in Markdown…"
              value={content}
              autoFocus
              onChange={(e) => setContent(e.target.value)}
            />
          ) : (
            <Markdown citations={note?.citations}>{content || "_Nothing here yet._"}</Markdown>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          {note && (
            <>
              <button className="btn !text-[12px]" disabled={!!busy} onClick={() => void remove()}>
                Delete
              </button>
              <button
                className="btn !text-[12px]"
                disabled={!!busy || !content.trim()}
                onClick={() => void toSource()}
                title="Copy this note into the notebook's sources"
              >
                {busy === "source" ? "Adding…" : "➕ Add as source"}
              </button>
            </>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]">{message}</span>
          <button
            className="btn btn-primary !text-[12px]"
            disabled={!!busy || !dirty}
            onClick={() => void save()}
          >
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
