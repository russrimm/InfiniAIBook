/**
 * Removing secrets from HAR content: used for the downloadable sanitized copy
 * and for anything sent to an AI model.
 */
import { SECRET_PARAM } from "./har";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
  "x-goog-api-key",
  "ocp-apim-subscription-key",
  "x-functions-key",
  "x-ms-client-principal",
]);

/**
 * Names that carry a credential even when they are not on the list above:
 * anything mentioning a token, key, secret, session, signature or credential.
 * CORS headers (access-control-*) and HTTP/2 pseudo-headers (:authority) only
 * look similar and keep their values.
 */
const SENSITIVE_HEADER_WORD = /(token|secret|api-?key|apikey|auth|session|password|credential|signature)/i;

function isSensitiveHeader(name: string): boolean {
  const n = name.toLowerCase();
  if (SENSITIVE_HEADERS.has(n)) return true;
  return !n.startsWith(":") && !n.startsWith("access-control-") && SENSITIVE_HEADER_WORD.test(n);
}

const REDACTED = "[redacted]";

/** A URL with credentials in it or in secret-looking query parameters; anything else is returned untouched. */
function scrubUrl(raw: string): string {
  try {
    const u = new URL(raw);
    let changed = Boolean(u.username || u.password);
    u.username = "";
    u.password = "";
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) {
        u.searchParams.set(k, REDACTED);
        changed = true;
      }
    }
    return changed ? u.href.replace(/%5Bredacted%5D/gi, REDACTED) : raw;
  } catch {
    return raw;
  }
}

export function redactText(s: string): string {
  return (
    s
      // URLs in free text (Location and Referer headers, bodies, findings) are scrubbed like request URLs.
      .replace(/https?:\/\/[^\s"'<>)\\]+/gi, (url) => scrubUrl(url))
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]")
      .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`)
      .replace(
        /("?(?:password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[_-]?key|apikey|authorization)"?\s*[:=]\s*"?)[^"&\s,}]+/gi,
        `$1${REDACTED}`
      )
      // Form-style pairs: a status "code" in a JSON body is kept, but code= in a query or form is an OAuth code.
      .replace(/([?&;]|^)((?:code|sig|signature|sid|sessionid|session|sas|key)=)[^&\s"';]+/gi, `$1$2${REDACTED}`)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
      .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, REDACTED)
      // 32 or more hex characters is a typical API key (an Azure key is 32); a hash or a dashless id goes too.
      .replace(/\b[0-9a-f]{32,}\b/gi, REDACTED)
  );
}

export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) u.searchParams.set(k, REDACTED);
    }
    return u.href.replace(/%5Bredacted%5D/gi, REDACTED);
  } catch {
    return redactText(raw);
  }
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** Every string anywhere inside a value passed through redactText. For fields the HAR spec does not define. */
function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)]));
  return value;
}

/** The fields of an object other than `known`, scrubbed; the known ones are handled by the caller. */
function scrubRest(obj: Json, known: string[]): Json {
  return scrubDeep(Object.fromEntries(Object.entries(obj).filter(([k]) => !known.includes(k)))) as Json;
}

function redactPairs(list: unknown, sensitiveNames: boolean): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((p) => {
    if (!isObj(p)) return p;
    const name = String(p.name ?? "");
    const hide = sensitiveNames ? isSensitiveHeader(name) : SECRET_PARAM.test(name);
    return { ...p, value: hide ? REDACTED : redactText(String(p.value ?? "")) };
  });
}

/** A copy of the archive that is safe to share: credentials, cookies and token-like values removed. */
export function sanitizeHar(data: unknown): unknown {
  if (!isObj(data) || !isObj(data.log) || !Array.isArray(data.log.entries)) return data;
  const entries = data.log.entries.map((raw) => {
    if (!isObj(raw)) return raw;
    const req = isObj(raw.request) ? raw.request : {};
    const res = isObj(raw.response) ? raw.response : {};
    const content = isObj(res.content) ? res.content : {};
    const post = isObj(req.postData) ? req.postData : null;
    return {
      // Fields the spec does not define (Chrome's _initiator with script URLs, comments) are scrubbed too.
      ...scrubRest(raw, ["request", "response"]),
      request: {
        ...scrubRest(req, ["url", "headers", "cookies", "queryString", "postData"]),
        url: redactUrl(String(req.url ?? "")),
        headers: redactPairs(req.headers, true),
        cookies: Array.isArray(req.cookies) ? req.cookies.map((c) => (isObj(c) ? { ...c, value: REDACTED } : c)) : req.cookies,
        queryString: redactPairs(req.queryString, false),
        ...(post
          ? {
              postData: {
                ...scrubRest(post, ["text", "params"]),
                text: typeof post.text === "string" ? redactText(post.text) : post.text,
                params: redactPairs(post.params, false),
              },
            }
          : {}),
      },
      response: {
        ...scrubRest(res, ["headers", "cookies", "redirectURL", "content"]),
        headers: redactPairs(res.headers, true),
        cookies: Array.isArray(res.cookies) ? res.cookies.map((c) => (isObj(c) ? { ...c, value: REDACTED } : c)) : res.cookies,
        redirectURL: typeof res.redirectURL === "string" ? redactUrl(res.redirectURL) : res.redirectURL,
        content: {
          ...scrubRest(content, ["text"]),
          text: typeof content.text === "string" && content.encoding !== "base64" ? redactText(content.text) : content.text,
        },
      },
    };
  });
  const { entries: _entries, ...logRest } = data.log;
  void _entries;
  return { ...data, log: { ...scrubDeep(logRest) as Json, entries } };
}
