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
  "x-auth-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
  "x-goog-api-key",
  "ocp-apim-subscription-key",
]);

const REDACTED = "[redacted]";

export function redactText(s: string): string {
  return s
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[jwt]")
    .replace(/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`)
    .replace(
      /("?(?:password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[_-]?key|authorization)"?\s*[:=]\s*"?)[^"&\s,}]+/gi,
      `$1${REDACTED}`
    )
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, REDACTED);
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

function redactPairs(list: unknown, sensitiveNames: boolean): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((p) => {
    if (!isObj(p)) return p;
    const name = String(p.name ?? "");
    const hide = sensitiveNames ? SENSITIVE_HEADERS.has(name.toLowerCase()) : SECRET_PARAM.test(name);
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
      ...raw,
      request: {
        ...req,
        url: redactUrl(String(req.url ?? "")),
        headers: redactPairs(req.headers, true),
        cookies: Array.isArray(req.cookies) ? req.cookies.map((c) => (isObj(c) ? { ...c, value: REDACTED } : c)) : req.cookies,
        queryString: redactPairs(req.queryString, false),
        ...(post
          ? {
              postData: {
                ...post,
                text: typeof post.text === "string" ? redactText(post.text) : post.text,
                params: redactPairs(post.params, false),
              },
            }
          : {}),
      },
      response: {
        ...res,
        headers: redactPairs(res.headers, true),
        cookies: Array.isArray(res.cookies) ? res.cookies.map((c) => (isObj(c) ? { ...c, value: REDACTED } : c)) : res.cookies,
        redirectURL: typeof res.redirectURL === "string" ? redactUrl(res.redirectURL) : res.redirectURL,
        content: {
          ...content,
          text: typeof content.text === "string" && content.encoding !== "base64" ? redactText(content.text) : content.text,
        },
      },
    };
  });
  return { ...data, log: { ...data.log, entries } };
}
