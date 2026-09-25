/**
 * Optional single-password protection, enabled by INFINIAIBOOK_PASSWORD.
 *
 * Runs in both the Edge middleware and Node routes, so it sticks to Web Crypto.
 * The cookie holds an HMAC of a fixed label keyed by the password, never the
 * password itself; changing the password invalidates every existing session.
 */

export const AUTH_COOKIE = "infiniaibook_auth";

export function authPassword(): string | null {
  const p = process.env.INFINIAIBOOK_PASSWORD;
  return p && p.length > 0 ? p : null;
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("infiniaibook-session-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent comparison, so timing does not reveal a matching prefix. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
