const warned = new Set<string>();

/**
 * A whole number of at least `min` from the environment. Anything else (a typo
 * such as "50MB", text, a negative) falls back to the default and says so
 * once. It must never become NaN: every `size > limit` test is false for NaN,
 * so a mistyped cap would silently turn the limit off.
 */
export function envInt(
  name: string,
  fallback: number,
  min = 1,
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= min) return Math.floor(n);
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[config] ${name}="${raw.slice(0, 40)}" is not a whole number of at least ${min}; using ${fallback}.`);
  }
  return fallback;
}
