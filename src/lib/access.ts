/**
 * Request-origin checks shared by the middleware. Pure functions over header
 * values so they run on the Edge runtime and can be unit tested.
 *
 * Two browser-borne attacks matter for a server that usually runs on
 * localhost without a password:
 *
 *  - DNS rebinding: a page on attacker.example re-points its own name at
 *    127.0.0.1, then reads this app's responses as same-origin. The request
 *    arrives with `Host: attacker.example`, so only known hosts are served.
 *  - Cross-site requests: any page can send a "simple" POST (text/plain) that
 *    route handlers still parse as JSON. Browsers label those with
 *    Sec-Fetch-Site / Origin, so state-changing API calls from another site
 *    are refused. Clients that send neither (curl, scripts) are not browsers
 *    and are unaffected.
 */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Hostname of a Host header value, without port or IPv6 brackets. */
export function hostnameOf(host: string | null | undefined): string {
  const h = (host ?? "").trim().toLowerCase();
  if (!h) return "";
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end === -1 ? h.slice(1) : h.slice(1, end);
  }
  // A bare IPv6 address has several colons and no port to strip.
  if ((h.match(/:/g) ?? []).length > 1) return h;
  return h.split(":")[0];
}

/** `ALLOWED_HOSTS`: comma-separated hostnames; `*` allows any. */
export function parseAllowedHosts(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => hostnameOf(s))
    .filter(Boolean);
}

export function hostAllowed(host: string | null, allowed: string[]): boolean {
  const name = hostnameOf(host);
  if (!name) return false;
  if (allowed.includes("*")) return true;
  if (LOOPBACK.has(name) || name.endsWith(".localhost")) return true;
  return allowed.includes(name);
}

/**
 * The same-origin path to continue to after signing in, or "/".
 *
 * A prefix check alone is not enough: browsers treat `\` as `/` and strip tabs
 * and newlines from URLs, so `/\evil.example` and `/\t/evil.example` both
 * navigate off-site. The value is resolved against this origin and only kept
 * when it stays here.
 */
export function safeNextPath(next: string | null | undefined, origin: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  try {
    const base = new URL(origin);
    const u = new URL(next, base);
    if (u.origin !== base.origin) return "/";
    return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    return "/";
  }
}

/**
 * Whether a request is a cross-site, state-changing API call from a browser.
 * `sameHosts` are the host values (with port) this app is reached at.
 */
export function isCrossSiteWrite(opts: {
  method: string;
  secFetchSite: string | null;
  origin: string | null;
  sameHosts: string[];
}): boolean {
  if (SAFE_METHODS.has(opts.method.toUpperCase())) return false;

  const site = opts.secFetchSite?.toLowerCase();
  if (site) return site !== "same-origin" && site !== "none";

  if (!opts.origin) return false;
  if (opts.origin === "null") return true;
  let originHost: string;
  try {
    originHost = new URL(opts.origin).host.toLowerCase();
  } catch {
    return true;
  }
  return !opts.sameHosts.some((h) => h && h.toLowerCase() === originHost);
}
