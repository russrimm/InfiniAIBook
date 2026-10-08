"use client";

import { useState } from "react";
import {
  MAX_INSTRUCTIONS,
  MAX_REPLACEMENTS,
  hasNarration,
  type NarrationSettings,
  type Replacement,
} from "@/lib/narration";

const fieldCls =
  "min-w-0 rounded-md border border-[var(--border)] bg-well px-2 py-1 text-[11px] text-[var(--fg)] outline-none placeholder:text-faint focus:border-focus disabled:opacity-60";

const same = (a: NarrationSettings, b: NarrationSettings) =>
  a.instructions.trim() === b.instructions.trim() &&
  JSON.stringify(a.replacements.filter((r) => r.from.trim())) ===
    JSON.stringify(b.replacements.filter((r) => r.from.trim()));

/**
 * Steering for what gets said: free-text instructions for the script writer
 * and a strict word-replacement list enforced on the finished script.
 */
export default function NarrationOptions({
  value,
  onChange,
  defaults,
  onSaveDefault,
  disabled = false,
  defaultOpen = false,
}: {
  value: NarrationSettings;
  onChange: (v: NarrationSettings) => void;
  /** The notebook's saved defaults; omit where there is nothing to save to. */
  defaults?: NarrationSettings;
  onSaveDefault?: (v: NarrationSettings) => Promise<void>;
  disabled?: boolean;
  defaultOpen?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = hasNarration({
    instructions: value.instructions.trim(),
    replacements: value.replacements.filter((r) => r.from.trim()),
  });
  const count = value.replacements.filter((r) => r.from.trim()).length;

  const setRow = (i: number, patch: Partial<Replacement>) =>
    onChange({
      ...value,
      replacements: value.replacements.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });

  const save = async () => {
    if (!onSaveDefault) return;
    setSaving(true);
    setError(null);
    try {
      await onSaveDefault(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="group rounded-lg border border-[var(--border)] bg-well/50" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-[11px] marker:hidden">
        <span className="text-[var(--muted)] group-open:rotate-90 transition-transform motion-reduce:transition-none">▸</span>
        <span className="font-medium">Instructions</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--muted)]">
          {active
            ? [
                value.instructions.trim() ? "custom instructions" : "",
                count ? `${count} replacement${count === 1 ? "" : "s"}` : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : "Avoid terms, translate, change the wording"}
        </span>
        {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden />}
      </summary>

      <div className="space-y-2 border-t border-[var(--border)] px-2 py-2">
        <label className="block">
          <span className="mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase">
            Tell the script writer
          </span>
          <textarea
            className={`${fieldCls} min-h-[3.5rem] w-full leading-snug`}
            maxLength={MAX_INSTRUCTIONS}
            disabled={disabled}
            placeholder={'e.g. "Narrate in Spanish." "Say it for a non-technical audience." "Don\'t mention pricing."'}
            value={value.instructions}
            onChange={(e) => onChange({ ...value, instructions: e.target.value })}
          />
        </label>

        <div>
          <span className="mb-1 block text-[10px] tracking-wide text-[var(--muted)] uppercase">
            Always replace · enforced on the final script
          </span>
          <div className="space-y-1">
            {value.replacements.map((r, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  className={`${fieldCls} flex-1`}
                  placeholder="Word or term"
                  aria-label={`Replacement ${i + 1}: term`}
                  disabled={disabled}
                  value={r.from}
                  onChange={(e) => setRow(i, { from: e.target.value })}
                />
                <span className="shrink-0 text-[10px] text-[var(--muted)]">→</span>
                <input
                  className={`${fieldCls} flex-1`}
                  placeholder="Say instead (blank removes it)"
                  aria-label={`Replacement ${i + 1}: say instead`}
                  disabled={disabled}
                  value={r.to}
                  onChange={(e) => setRow(i, { to: e.target.value })}
                />
                <button
                  type="button"
                  className="shrink-0 rounded px-1 text-[11px] text-[var(--muted)] hover:text-red-300"
                  aria-label={`Remove replacement ${i + 1}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      replacements: value.replacements.filter((_, j) => j !== i),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-1 text-[10px] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-50"
            disabled={disabled || value.replacements.length >= MAX_REPLACEMENTS}
            onClick={() =>
              onChange({ ...value, replacements: [...value.replacements, { from: "", to: "" }] })
            }
          >
            + Add replacement
          </button>
        </div>

        {defaults && onSaveDefault && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
            <button
              type="button"
              className="btn !px-2 !py-0.5 !text-[10px]"
              disabled={disabled || saving || same(value, defaults)}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : same(value, defaults) ? "Notebook default" : "Save as notebook default"}
            </button>
            {!same(value, defaults) && (
              <button
                type="button"
                className="text-[10px] text-[var(--muted)] hover:text-[var(--fg)]"
                disabled={disabled}
                onClick={() => onChange(defaults)}
              >
                Reset to default
              </button>
            )}
            {error && <span className="text-[10px] text-red-300">{error}</span>}
          </div>
        )}
      </div>
    </details>
  );
}
