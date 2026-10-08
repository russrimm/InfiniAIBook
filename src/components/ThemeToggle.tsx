"use client";

import { useSyncExternalStore } from "react";
import {
  THEME_EVENT,
  nextPreference,
  readPreference,
  setPreference,
  type ThemePreference,
} from "@/lib/theme";

const LABEL: Record<ThemePreference, string> = { system: "Auto", light: "Light", dark: "Dark" };
const ICON: Record<ThemePreference, string> = { system: "🌓", light: "☀️", dark: "🌙" };

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * One button that steps through Auto (follow the system) → Light → Dark.
 * `variant="nav"` matches the quiet text links on the notebook list; the
 * default matches the compact header buttons in a notebook.
 */
export default function ThemeToggle({
  variant = "button",
  className = "",
}: {
  variant?: "button" | "nav";
  className?: string;
}) {
  const pref = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const next = nextPreference(pref);
  const base =
    variant === "nav"
      ? "rounded-lg px-3 py-1.5 whitespace-nowrap text-[var(--muted)] transition hover:bg-hover hover:text-[var(--fg)]"
      : "btn shrink-0 !px-2.5 !py-1 !text-[11px]";

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      className={`${base} ${className}`}
      onClick={() => setPreference(next)}
      title={`Theme: ${LABEL[pref]}. Click for ${LABEL[next]}.`}
      aria-label={`Theme: ${LABEL[pref]}. Switch to ${LABEL[next]}.`}
    >
      <span aria-hidden>{ICON[pref]}</span>{" "}
      <span className="hidden md:inline">{LABEL[pref]}</span>
    </button>
  );
}
