"use client";

import { useId, useState } from "react";
import { useConfirm } from "./ConfirmDialog";
import { MAX_TAGS, MAX_TAG_CHARS, normalizeTag, normalizeTags } from "@/lib/tags";
import type { Source } from "@/lib/types";

const chip =
  "rounded-full border border-[var(--border)] bg-well px-2 py-0.5 text-[11px] leading-snug text-[var(--muted)] transition hover:text-[var(--fg)]";

/** Buttons for every tag in use, to show only the sources that carry one. */
export function TagFilter({
  tags,
  active,
  onChange,
}: {
  tags: { tag: string; count: number }[];
  active: string | null;
  onChange: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div role="group" aria-label="Filter sources by tag" className="mt-2 flex flex-wrap gap-1.5">
      <button
        type="button"
        className={`${chip} ${active === null ? "!border-[var(--accent)] !text-[var(--fg)]" : ""}`}
        aria-pressed={active === null}
        onClick={() => onChange(null)}
      >
        All
      </button>
      {tags.map(({ tag, count }) => (
        <button
          key={tag}
          type="button"
          className={`${chip} ${active?.toLowerCase() === tag.toLowerCase() ? "!border-[var(--accent)] !text-[var(--fg)]" : ""}`}
          aria-pressed={active?.toLowerCase() === tag.toLowerCase()}
          onClick={() => onChange(active?.toLowerCase() === tag.toLowerCase() ? null : tag)}
        >
          {tag} <span className="text-dim">{count}</span>
        </button>
      ))}
    </div>
  );
}

/** A source's tags as buttons that filter by them, and the small form that edits them. */
export function RowTags({
  source,
  editing,
  onFilter,
  onDone,
  onChanged,
}: {
  source: Source;
  editing: boolean;
  onFilter: (tag: string) => void;
  onDone: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const tags = source.tags ?? [];
  const [draft, setDraft] = useState(tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: normalizeTags(draft) }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Could not save the tags.");
      await onChanged();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the tags.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form
        className="mt-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="text-[11px] text-[var(--muted)]" htmlFor={fieldId}>
          Tags for this source, separated by commas (up to {MAX_TAGS})
        </label>
        <input
          id={fieldId}
          className="input mt-1 w-full !py-1 text-[13px]"
          value={draft}
          maxLength={MAX_TAGS * (MAX_TAG_CHARS + 2)}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }}
        />
        {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
        <div className="mt-1.5 flex gap-1.5">
          <button type="submit" className="btn btn-primary !px-2 !py-0.5 !text-[11px]" disabled={busy}>
            Save tags
          </button>
          <button type="button" className="btn !px-2 !py-0.5 !text-[11px]" onClick={onDone}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (tags.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label={`Tags on ${source.title}`}>
      {tags.map((t) => (
        <li key={t}>
          <button type="button" className={chip} onClick={() => onFilter(t)} title={`Show only sources tagged “${t}”`}>
            {t}
          </button>
        </li>
      ))}
    </ul>
  );
}

type Undo = { message: string; run?: () => Promise<void> };

/**
 * Tag, untag or delete the sources that are ticked and showing. Tagging says
 * how many changed and offers Undo; deleting asks first and goes through the
 * app's delete undo.
 */
export function BulkBar({
  notebookId,
  targets,
  tags,
  onChanged,
  onRemoveMany,
}: {
  notebookId: string;
  /** The ticked sources that are currently listed. */
  targets: Source[];
  tags: string[];
  onChanged: () => Promise<void> | void;
  onRemoveMany: (items: Source[]) => void;
}) {
  const askConfirm = useConfirm();
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const listId = useId();
  const noun = (n: number) => `${n.toLocaleString("en-US")} source${n === 1 ? "" : "s"}`;

  const post = async (body: unknown) => {
    const res = await fetch(`/api/notebooks/${notebookId}/sources/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      updated?: number;
      skipped?: number;
      previous?: Record<string, string[]>;
    };
    if (!res.ok) throw new Error(j.error || "Could not change those sources.");
    return j;
  };

  const change = async (action: "addTag" | "removeTag") => {
    const name = normalizeTag(tag);
    if (!name) {
      setError("Type a tag name first.");
      return;
    }
    setBusy(true);
    setError(null);
    setUndo(null);
    try {
      const j = await post({ action, ids: targets.map((s) => s.id), tag: name });
      const updated = j.updated ?? 0;
      const skipped = j.skipped ?? 0;
      await onChanged();
      const verb = action === "addTag" ? `Tagged ${noun(updated)} “${name}”` : `Removed “${name}” from ${noun(updated)}`;
      const note = updated === 0 ? (action === "addTag" ? `Nothing to change: ${noun(targets.length)} already had “${name}”.` : `None of those sources had “${name}”.`) : `${verb}.`;
      const extra = skipped ? ` ${noun(skipped)} already ${skipped === 1 ? "has" : "have"} ${MAX_TAGS} tags and could not take another.` : "";
      setUndo({
        message: note + extra,
        run:
          updated === 0
            ? undefined
            : async () => {
                await post({ action: "restore", tags: j.previous });
                await onChanged();
              },
      });
      if (action === "addTag") setTag("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change those sources.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await askConfirm({
      title: `Delete ${noun(targets.length)}?`,
      message: `Their text, passages and tags are deleted from this notebook. You can undo this for a few seconds.`,
      confirmLabel: `Delete ${noun(targets.length)}`,
      destructive: true,
    });
    if (ok) onRemoveMany(targets);
  };

  return (
    <div role="group" aria-label="Manage ticked sources" className="mb-2 rounded-xl border border-[var(--border)] bg-well p-2.5" data-testid="bulk-bar">
      <p className="text-xs font-medium">
        {targets.length === 0 ? "Tick sources to tag or delete them." : `${noun(targets.length)} ticked`}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor={`${listId}-tag`}>
          Tag name
        </label>
        <input
          id={`${listId}-tag`}
          list={listId}
          className="input w-full basis-full !py-1 text-[13px]"
          placeholder="Tag name"
          maxLength={MAX_TAG_CHARS}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <datalist id={listId}>
          {tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="button" className="btn !px-2 !py-1 !text-[11px]" disabled={busy || targets.length === 0} onClick={() => void change("addTag")}>
          Add tag
        </button>
        <button type="button" className="btn !px-2 !py-1 !text-[11px]" disabled={busy || targets.length === 0} onClick={() => void change("removeTag")}>
          Remove tag
        </button>
        <button type="button" className="btn !px-2 !py-1 !text-[11px] hover:!text-red-400" disabled={busy || targets.length === 0} onClick={() => void remove()}>
          Delete…
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[11px] text-red-300">
          {error}
        </p>
      )}
      {undo && (
        <p role="status" className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
          <span>{undo.message}</span>
          {undo.run && (
            <button
              type="button"
              className="btn btn-primary !px-2 !py-0.5 !text-[11px]"
              onClick={() => {
                const run = undo.run!;
                setUndo(null);
                void run().catch((e) => setError(e instanceof Error ? e.message : "Could not undo that."));
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
    </div>
  );
}
