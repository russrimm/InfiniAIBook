/**
 * Optional single-password protection, enabled by INFINIAIBOOK_PASSWORD.
 *
 * Sticks to Web Crypto and keeps no server-side state.
 *
 * The session cookie is `v3.<issuedAt>.<expiresAt>.<mac>`: an expiry signed
 * with a key derived from the password and the optional
 * INFINIAIBOOK_SESSION_SECRET. It never contains the password. Changing either
 * value invalidates every session ("sign out everywhere"); otherwise a cookie
 * stops working when it expires.
 *
 * The key comes from PBKDF2 (210,000 rounds), not from the password directly,
 * so someone who captures a cookie cannot test password guesses against its
 * signature at hash speed. The derivation runs once per process and is cached.
 */

export const AUTH_COOKIE = "infiniaibook_auth";

/** How long a sign-in lasts. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function authPassword(): string | null {
  const p = process.env.INFINIAIBOOK_PASSWORD;
  return p && p.length > 0 ? p : null;
}

/** Dedicated bearer token for scripts, so they need not hold the password. */
export function apiToken(): string | null {
  const t = process.env.INFINIAIBOOK_API_TOKEN?.trim();
  return t ? t : null;
}

const KDF_ROUNDS = 210_000;
const KDF_SALT = "infiniaibook-session-v3";
const MAX_CACHED_KEYS = 4;
const keyCache = new Map<string, Promise<CryptoKey>>();

async function deriveKey(material: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(material), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(KDF_SALT), iterations: KDF_ROUNDS },
    base,
    256
  );
  return crypto.subtle.importKey("raw", bits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

/** The HMAC key for this password and session secret, derived once and kept. */
function signingKey(password: string): Promise<CryptoKey> {
  const material = `${password}\u0000${process.env.INFINIAIBOOK_SESSION_SECRET ?? ""}`;
  let key = keyCache.get(material);
  if (!key) {
    // A changed password or secret must not leave old keys piling up.
    if (keyCache.size >= MAX_CACHED_KEYS) keyCache.delete(keyCache.keys().next().value as string);
    key = deriveKey(material);
    keyCache.set(material, key);
  }
  return key;
}

async function hmacHex(password: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(password), new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionToken(
  password: string,
  now = Date.now(),
  ttlSeconds = SESSION_TTL_SECONDS
): Promise<string> {
  const iat = Math.floor(now / 1000);
  const exp = iat + ttlSeconds;
  const mac = await hmacHex(password, `v3|${iat}|${exp}`);
  return `v3.${iat}.${exp}.${mac}`;
}

export async function verifySessionToken(
  token: string,
  password: string,
  now = Date.now()
): Promise<boolean> {
  const m = /^v3\.(\d{1,12})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const [, iat, exp, mac] = m;
  const expected = await hmacHex(password, `v3|${iat}|${exp}`);
  if (!safeEqual(mac, expected)) return false;
  const nowSec = Math.floor(now / 1000);
  // A token "issued" in the future was not issued by this server's clock.
  return Number(exp) > nowSec && Number(iat) <= nowSec + 300;
}

let warnedPasswordBearer = false;

/** Older scripts sent the password as a bearer token. Off unless explicitly enabled. */
export function passwordBearerAllowed(): boolean {
  return /^(1|true|yes)$/i.test(process.env.INFINIAIBOOK_ALLOW_PASSWORD_BEARER ?? "");
}

/**
 * Accepts INFINIAIBOOK_API_TOKEN. The password itself is accepted only when no
 * API token is set and INFINIAIBOOK_ALLOW_PASSWORD_BEARER=true.
 */
export function bearerAllowed(bearer: string, password: string): boolean {
  const token = apiToken();
  if (token) return safeEqual(bearer, token);
  if (!passwordBearerAllowed() || !safeEqual(bearer, password)) return false;
  if (!warnedPasswordBearer) {
    warnedPasswordBearer = true;
    console.warn(
      "[auth] A script authenticated with the password as its bearer token. " +
        "Set INFINIAIBOOK_API_TOKEN and use that instead. This fallback exists " +
        "only because INFINIAIBOOK_ALLOW_PASSWORD_BEARER is set."
    );
  }
  return true;
}

/** Length-independent comparison, so timing does not reveal a matching prefix. */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** Whether the request reached us over HTTPS, directly or via a trusted proxy. */
export function requestIsHttps(req: Request): boolean {
  if (new URL(req.url).protocol === "https:") return true;
  const trustProxy = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");
  return (
    trustProxy &&
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https"
  );
}
