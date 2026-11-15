"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MoreIcon } from "./icons";

export type OverflowItem = {
  key: string;
  label: string;
  icon: ReactNode;
  /** A second line, such as the current value of a setting. */
  detail?: string;
  /** Navigates instead of acting. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  /** Leave the menu open after choosing, for settings that cycle. */
  keepOpen?: boolean;
  testId?: string;
};

/**
 * The "More" button for secondary header actions on small screens. It follows
 * the menu-button pattern: the trigger opens the list (click, Enter, Space or
 * Arrow keys), arrows/Home/End move between items, Escape and Tab close it,
 * and focus goes back to the trigger so the next Tab continues from where the
 * user was. Items are 44px tall for touch.
 */
export default function OverflowMenu({
  label = "More actions",
  items,
  className = "",
}: {
  label?: string;
  items: OverflowItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef<"first" | "last">("first");
  const menuId = useId();

  const enabled = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open) return;
    const list = enabled();
    (focusOnOpen.current === "last" ? list[list.length - 1] : list[0])?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };

  const openWith = (where: "first" | "last") => {
    focusOnOpen.current = where;
    setOpen(true);
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openWith(event.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKey = (event: KeyboardEvent) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(at + 1);
      case "ArrowUp":
        return move(at < 0 ? -1 : at - 1);
      case "Home":
        return move(0);
      case "End":
        return move(list.length - 1);
      case "Escape":
        // Handled here so the Sources panel behind it does not also close.
        event.preventDefault();
        return close();
      case "Tab":
        return setOpen(false);
    }
  };

  const choose = (item: OverflowItem) => {
    if (item.disabled) return;
    if (!item.keepOpen) close();
    item.onSelect?.();
  };

  const rowClass =
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--fg)] transition hover:bg-hover focus-visible:bg-hover focus-visible:!outline-offset-[-2px] aria-disabled:cursor-not-allowed aria-disabled:opacity-45";

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        className="btn !min-h-11 !min-w-11 shrink-0 !px-2.5"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openWith("first"))}
        onKeyDown={onTriggerKey}
      >
        <MoreIcon />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className="card absolute top-full right-0 z-50 mt-1 w-64 max-w-[calc(100vw-1rem)] p-1 shadow-lg"
        >
          {items.map((item) => {
            const body = (
              <>
                <span aria-hidden className="flex w-5 shrink-0 justify-center text-[var(--muted)]">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.detail && (
                    <span className="block truncate text-[11px] text-[var(--muted)]">{item.detail}</span>
                  )}
                </span>
              </>
            );
            const common = {
              role: "menuitem",
              tabIndex: -1,
              "aria-disabled": item.disabled || undefined,
              "data-testid": item.testId,
              className: rowClass,
            };
            return item.href ? (
              <Link key={item.key} href={item.href} {...common} onClick={() => setOpen(false)}>
                {body}
              </Link>
            ) : (
              <button key={item.key} type="button" {...common} onClick={() => choose(item)}>
                {body}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
