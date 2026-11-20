"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { MAX_FIND_MATCHES } from "@/lib/highlight";

type HighlightRegistry = { set: (name: string, h: unknown) => void; delete: (name: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

const registry = (): HighlightRegistry | null => (typeof CSS !== "undefined" ? ((CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null) : null);
const HighlightClass = (): HighlightCtor | null =>
  typeof window !== "undefined" ? ((window as unknown as { Highlight?: HighlightCtor }).Highlight ?? null) : null;

/** Text of the chat that can match: not buttons (copy, regenerate, citation chips) or form fields. */
function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const el = n.parentElement;
      if (!el || el.closest("button, textarea, input, select, script, style, [data-no-find]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Every case-insensitive occurrence of `query` inside the chat, in reading order. */
export function findInChat(root: HTMLElement, query: string): { ranges: Range[]; capped: boolean } {
  const needle = query.trim().toLowerCase();
  const ranges: Range[] = [];
  if (!needle) return { ranges, capped: false };
  for (const node of textNodes(root)) {
    const text = node.nodeValue!.toLowerCase();
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
      if (ranges.length >= MAX_FIND_MATCHES) return { ranges, capped: true };
      const r = document.createRange();
      r.setStart(node, at);
      r.setEnd(node, at + needle.length);
      ranges.push(r);
    }
  }
  return { ranges, capped: false };
}

/**
 * Find in this chat: counts the matches in the conversation as it is shown,
 * marks them with the CSS Custom Highlight API (no markup is added, so the
 * rendered Markdown and its citations are untouched), and steps through them
 * with Enter and Shift+Enter. Where the highlight API is missing the current
 * match is selected instead.
 */
export default function ChatFind({
  scrollRef,
  contentKey,
  onClose,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  /** Changes when the conversation does, so matches are found again. */
  contentKey: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [found, setFound] = useState<{ count: number; capped: boolean }>({ count: 0, capped: false });
  const ranges = useRef<Range[]>([]);

  const clear = useCallback(() => {
    registry()?.delete("chat-find");
    registry()?.delete("chat-find-current");
  }, []);

  // Find again when the query or the conversation changes.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const t = setTimeout(() => {
      const result = findInChat(root, query);
      ranges.current = result.ranges;
      setFound({ count: result.ranges.length, capped: result.capped });
      setCurrent(0);
    }, 120);
    return () => clearTimeout(t);
  }, [query, contentKey, scrollRef]);

  // Mark them all, mark the current one more strongly, and bring it into view.
  useEffect(() => {
    const reg = registry();
    const Highlight = HighlightClass();
    const all = ranges.current;
    const now = all[current];
    if (reg && Highlight) {
      if (all.length) reg.set("chat-find", new Highlight(...all));
      else reg.delete("chat-find");
      if (now) reg.set("chat-find-current", new Highlight(now));
      else reg.delete("chat-find-current");
    } else if (now) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(now);
    }
    now?.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [found, current]);

  useEffect(() => clear, [clear]);

  const step = (by: number) => {
    if (!found.count) return;
    setCurrent((c) => (c + by + found.count) % found.count);
  };

  const status = !query.trim()
    ? ""
    : found.count === 0
      ? "No matches"
      : `${current + 1} of ${found.count}${found.capped ? "+" : ""}`;

  return (
    <div role="search" aria-label="Find in this chat" className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-well px-4 py-2 sm:px-8" data-testid="chat-find">
      <label htmlFor="chat-find-input" className="sr-only">
        Find in this chat
      </label>
      <input
        id="chat-find-input"
        type="search"
        autoFocus
        autoComplete="off"
        className="input !h-8 min-w-0 flex-1 !py-0 text-xs"
        placeholder="Find in this chat"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            step(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span role="status" aria-live="polite" className="min-w-[4.5rem] shrink-0 text-right text-[11px] text-[var(--muted)] tabular-nums">
        {status}
      </span>
      <button type="button" className="btn shrink-0 !px-2 !py-1 !text-[11px]" aria-label="Previous match" disabled={!found.count} onClick={() => step(-1)}>
        ↑
      </button>
      <button type="button" className="btn shrink-0 !px-2 !py-1 !text-[11px]" aria-label="Next match" disabled={!found.count} onClick={() => step(1)}>
        ↓
      </button>
      <button type="button" className="btn shrink-0 !px-2 !py-1 !text-[11px]" aria-label="Close find" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
