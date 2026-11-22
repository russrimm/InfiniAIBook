/**
 * Turns the body a browser posts for a Content Security Policy violation into
 * short log lines. Browsers send two shapes: the older `{"csp-report": {...}}`
 * with `application/csp-report`, and the Reporting API's array of
 * `{type: "csp-violation", body: {...}}` with `application/reports+json`.
 */

type Fields = Record<string, unknown>;

/** An address without its query or fragment (they can carry tokens), shortened. */
export function bareUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value.slice(0, 120); // inline, eval, self
  try {
    const u = new URL(value);
    if (u.protocol === "data:" || u.protocol === "blob:") return `${u.protocol}…`;
    return `${u.origin}${u.pathname}`.slice(0, 160);
  } catch {
    return value.split(/[?#]/)[0]!.slice(0, 160);
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.replace(/[\r\n]+/g, " ").slice(0, 80) : "");

function line(fields: Fields): string | null {
  const directive = text(fields["effective-directive"] ?? fields.effectiveDirective ?? fields["violated-directive"] ?? fields.violatedDirective);
  if (!directive) return null;
  const blocked = bareUrl(fields["blocked-uri"] ?? fields.blockedURL ?? fields.blockedURI) || "inline";
  const page = bareUrl(fields["document-uri"] ?? fields.documentURL ?? fields.documentURI);
  const file = bareUrl(fields["source-file"] ?? fields.sourceFile);
  const at = file ? ` in ${file}${fields["line-number"] ?? fields.lineNumber ? `:${String(fields["line-number"] ?? fields.lineNumber).slice(0, 8)}` : ""}` : "";
  return `[csp] report-only: ${directive} would block ${blocked}${at} on ${page || "a page"}`;
}

/** One log line for each violation in a report body; anything unreadable gives none. */
export function formatCspReports(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const lines: string[] = [];
  for (const item of items.slice(0, 20)) {
    const obj = item as Fields | null;
    if (!obj || typeof obj !== "object") continue;
    const body = (obj["csp-report"] ?? obj.body ?? obj) as Fields;
    if (body && typeof body === "object") {
      const l = line(body);
      if (l) lines.push(l);
    }
  }
  return lines;
}
