/**
 * Request access rules, kept free of Next imports so they can be unit tested
 * and run in the Edge middleware.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function parseAllowedHosts(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** Strip the port from a Host header value, keeping IPv6 brackets. */
export function hostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0];
}

/**
 * Loopback names and ALLOWED_HOSTS only. Refusing any other Host stops a
 * DNS-rebinding page from talking to this server through the user's browser.
 */
export function hostAllowed(host: string | null, allowed: string[]): boolean {
  if (!host) return false;
  const name = hostname(host);
  if (LOOPBACK.has(name)) return true;
  return allowed.includes("*") || allowed.includes(name);
}

/**
 * A state-changing request a browser sent from another site. Requests with
 * neither Origin nor Sec-Fetch-Site are not from a browser and pass.
 */
export function isCrossSiteWrite(opts: {
  method: string;
  secFetchSite: string | null;
  origin: string | null;
  sameHosts: string[];
}): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(opts.method.toUpperCase())) return false;
  if (opts.secFetchSite) return !["same-origin", "none"].includes(opts.secFetchSite);
  if (!opts.origin) return false;
  try {
    const originHost = new URL(opts.origin).host.toLowerCase();
    return !opts.sameHosts.filter(Boolean).some((h) => h.toLowerCase() === originHost);
  } catch {
    return true;
  }
}

/** Constant-time string comparison (Edge runtime has no crypto.timingSafeEqual). */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Check an HTTP Basic Authorization header against the password; any username. */
export function basicAuthOk(header: string | null, password: string): boolean {
  const m = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)$/i);
  if (!m) return false;
  let decoded: string;
  try {
    decoded = atob(m[1]);
  } catch {
    return false;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  return safeEqual(decoded.slice(sep + 1), password);
}
