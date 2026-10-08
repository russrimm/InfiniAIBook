/**
 * Light / dark / system theme.
 *
 * The preference is stored in localStorage and applied to <html> as
 * `data-theme="light|dark"` (the resolved look) and `data-theme-pref`
 * (what the user chose). globals.css keys every color off those attributes.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "infiniaibook-theme";
export const THEME_EVENT = "infiniaibook-theme-change";

export const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parsePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(pref: ThemePreference, systemPrefersLight: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersLight ? "light" : "dark";
  return pref;
}

/** The preference a click on the theme button moves to: system → light → dark → system. */
export function nextPreference(pref: ThemePreference): ThemePreference {
  return PREFERENCES[(PREFERENCES.indexOf(pref) + 1) % PREFERENCES.length];
}

/**
 * Runs before first paint (inlined in <head>) so a light-mode user never sees
 * a dark flash, and keeps "system" in step with the operating system. It must
 * stay self-contained: it is serialized into the page as-is.
 */
export const THEME_INIT_SCRIPT = `(function(){var K=${JSON.stringify(THEME_KEY)};var d=document.documentElement;var q=window.matchMedia("(prefers-color-scheme: light)");function apply(){var p="system";try{var s=localStorage.getItem(K);if(s==="light"||s==="dark")p=s}catch(e){}d.setAttribute("data-theme-pref",p);d.setAttribute("data-theme",p==="system"?(q.matches?"light":"dark"):p)}apply();q.addEventListener("change",apply);window.addEventListener("storage",function(e){if(e.key===K)apply()});window.addEventListener(${JSON.stringify(THEME_EVENT)},apply)})();`;

/** Saves and applies a preference. Safe to call from event handlers only. */
export function setPreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
    document.documentElement.setAttribute("data-theme-pref", pref);
    document.documentElement.setAttribute(
      "data-theme",
      resolveTheme(pref, window.matchMedia("(prefers-color-scheme: light)").matches),
    );
    return;
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function readPreference(): ThemePreference {
  if (typeof document === "undefined") return "system";
  return parsePreference(document.documentElement.getAttribute("data-theme-pref"));
}
