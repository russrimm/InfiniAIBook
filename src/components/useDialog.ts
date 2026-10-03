"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Open dialogs, oldest first. Only the last one answers Escape and Tab. */
const stack: symbol[] = [];

function tabbable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hidden && el.getClientRects().length > 0 && !el.closest("[inert]")
  );
}

/**
 * Shared modal behavior: focus moves into the dialog when it opens, Tab stays
 * inside it, Escape closes only the topmost dialog, focus returns to whatever
 * opened it, and the backdrop closes it only on a click that both started and
 * ended there — so selecting text and releasing outside never discards work.
 *
 * Spread `backdropProps` on the scrim and attach `dialogRef` to the element
 * with role="dialog" (it gets tabIndex={-1} so it can hold focus itself).
 */
export function useDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const id = Symbol("dialog");
    stack.push(id);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = dialogRef.current;
    // Leave focus alone if a field inside already took it (autoFocus).
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = tabbable(el);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !el.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // Hand focus back to the control that opened the dialog, if it is still there.
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const backdropProps = {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onCloseRef.current();
      downOnBackdrop.current = false;
    },
  };

  return { dialogRef, backdropProps };
}
