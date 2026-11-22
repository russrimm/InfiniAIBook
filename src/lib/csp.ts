import { THEME_INIT_SCRIPT } from "./theme";

/**
 * The strict Content Security Policy, built per request.
 *
 * It differs from the policy `next.config.ts` enforces in two ways: scripts
 * run only with this request's nonce (or the fixed theme script's hash), with
 * no 'unsafe-inline'; and connections are limited to this app plus the hosts
 * the configured Speech region needs, instead of the whole Azure OpenAI and
 * Speech host families. It is sent as Content-Security-Policy-Report-Only, so
 * a browser reports what it would have blocked at /api/csp-report without
 * blocking anything. docs/csp.md explains how to move to enforcing it.
 */

export type CspEnv = Record<string, string | undefined>;

/** Where browser reports go. */
export const CSP_REPORT_PATH = "/api/csp-report";

/** A new random value for each request; it must never be reused or guessable. */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

/** `'sha256-…'` source for an inline script, so a fixed script needs no nonce. */
export async function scriptHash(script: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
}

let themeHash: Promise<string> | null = null;
/** The hash of the theme bootstrap script in the root layout and the global error page. */
export const themeScriptHash = () => (themeHash ??= scriptHash(THEME_INIT_SCRIPT));

/**
 * The hosts the browser itself connects to. Everything else the app calls
 * goes through its own server. The live avatar's Speech SDK opens HTTPS and
 * WebSocket connections to the text-to-speech host of the configured region.
 */
export function connectSources(env: CspEnv, dev: boolean): string[] {
  const sources = ["'self'"];
  const region = env.AZURE_SPEECH_REGION?.trim().toLowerCase();
  if (region && /^[a-z0-9-]{2,40}$/.test(region)) {
    sources.push(`https://${region}.tts.speech.microsoft.com`, `wss://${region}.tts.speech.microsoft.com`);
  }
  // Next's dev server hot-reloads over a WebSocket.
  if (dev) sources.push("ws:", "wss:");
  return sources;
}

export function buildCsp(opts: { nonce: string; themeHash: string; dev: boolean; env: CspEnv }): string {
  const { nonce, themeHash, dev, env } = opts;
  return [
    "default-src 'self'",
    // 'strict-dynamic' trusts the scripts a nonce-carrying script loads (Next's
    // chunks), so no host list is needed. React Refresh needs eval in development only.
    `script-src 'nonce-${nonce}' ${themeHash} 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src ${connectSources(env, dev).join(" ")}`,
    "worker-src 'self' blob:",
    // The in-app browser frames arbitrary http(s) pages.
    "frame-src http: https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}
