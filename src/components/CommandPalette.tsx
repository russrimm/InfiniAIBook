"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { GROUP_ORDER, filterCommands, type Command } from "@/lib/commands";
import { useDialog } from "./useDialog";

/**
 * Ctrl/Cmd+K: type to find an action, a Studio format, a source or a shortcut,
 * Up and Down to move, Enter to run it, Escape to close. It is a combobox with
 * a listbox, so a screen reader hears the number of results and the option the
 * focus is on while focus stays in the text field.
 */
export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const { dialogRef, backdropProps } = useDialog(onClose);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const base = useId();
  // After useDialog has noted what opened this, so Escape can give focus back to it.
  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const found = filterCommands(commands, query);
    // With nothing typed, show each group together in its usual order.
    return query.trim() ? found : [...found].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [commands, query]);
  const index = Math.min(active, Math.max(0, results.length - 1));
  const optionId = (i: number) => `${base}-opt-${i}`;

  useEffect(() => {
    listRef.current?.querySelector(`#${CSS.escape(optionId(index))}`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, results]);

  const run = (c: Command) => {
    onClose();
    // After the dialog has closed and returned focus, so the command can move it somewhere better.
    setTimeout(c.run, 0);
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center bg-black/65 p-4 pt-[12vh] backdrop-blur-sm" {...backdropProps}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-testid="command-palette"
        className="fade-up card flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden !p-0 outline-none"
      >
        <div className="border-b border-[var(--border)] p-3">
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-controls={`${base}-list`}
            aria-activedescendant={results.length ? optionId(index) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            className="input w-full !py-2 text-sm"
            placeholder="Type a command, format or source name"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(results.length ? (index + 1) % results.length : 0);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(results.length ? (index - 1 + results.length) % results.length : 0);
              } else if (e.key === "Home") {
                e.preventDefault();
                setActive(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setActive(Math.max(0, results.length - 1));
              } else if (e.key === "Enter" && results[index] && !e.nativeEvent.isComposing) {
                e.preventDefault();
                run(results[index]);
              }
            }}
          />
          <p role="status" className="sr-only">
            {results.length === 0 ? "No matching commands" : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <ul ref={listRef} id={`${base}-list`} role="listbox" aria-label="Commands" className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 && <li role="presentation" className="px-3 py-6 text-center text-xs text-[var(--muted)]">Nothing matches “{query.trim()}”. Try a shorter word.</li>}
          {results.map((c, i) => {
            const newGroup = !query.trim() && (i === 0 || results[i - 1].group !== c.group);
            return (
              <li key={c.id} role="presentation">
                {newGroup && (
                  <div aria-hidden className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">
                    {c.group}
                  </div>
                )}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === index}
                  aria-label={`${c.group}: ${c.label}${c.detail ? `. ${c.detail}` : ""}${c.keys ? `. Shortcut ${c.keys}` : ""}`}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === index ? "bg-hover text-[var(--fg)]" : "text-[var(--muted)]"}`}
                  onMouseMove={() => i !== index && setActive(i)}
                  onClick={() => run(c)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--fg)]">{c.label}</span>
                    {c.detail && <span className="block truncate text-[11px]">{c.detail}</span>}
                  </span>
                  {query.trim() && <span className="shrink-0 text-[10px] text-dim">{c.group}</span>}
                  {c.keys && (
                    <kbd className="shrink-0 rounded border border-[var(--border)] bg-well px-1.5 py-0.5 font-mono text-[11px]">{c.keys}</kbd>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          Up and Down choose, Enter runs, Escape closes.
        </p>
      </div>
    </div>
  );
}
