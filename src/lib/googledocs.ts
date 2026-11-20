/**
 * Google Docs, Sheets and Slides shared with "Anyone with the link", read as
 * plain text through Google's own export links. No sign-in or API key is used,
 * so a private document cannot be read and the app says how to share it.
 */

export type GoogleDocLink = {
  kind: "document" | "spreadsheet" | "presentation";
  id: string;
  /** The text export of the same document. */
  exportUrl: string;
  noun: string;
};

const PATHS = { document: "document", spreadsheet: "spreadsheets", presentation: "presentation" } as const;
const NOUNS = { document: "Google Doc", spreadsheet: "Google Sheet", presentation: "Google Slides deck" } as const;

/** The export link for a docs.google.com document, sheet or slides URL. Null for anything else, including "published to the web" (/d/e/…) links, which are ordinary pages. */
export function parseGoogleDocLink(raw: string): GoogleDocLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "docs.google.com") return null;
  const m = /^\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/.exec(url.pathname);
  if (!m) return null;
  const kind = (Object.keys(PATHS) as (keyof typeof PATHS)[]).find((k) => PATHS[k] === m[1])!;
  const base = `https://docs.google.com/${m[1]}/d/${m[2]}`;
  let exportUrl: string;
  if (kind === "document") exportUrl = `${base}/export?format=txt`;
  else if (kind === "presentation") exportUrl = `${base}/export/txt`;
  else {
    // A sheet exports one tab at a time; keep the tab the link points at.
    const gid = /(?:^|[#&?])gid=(\d{1,12})/.exec(`${url.hash}&${url.search}`)?.[1];
    exportUrl = `${base}/export?format=csv${gid ? `&gid=${gid}` : ""}`;
  }
  return { kind, id: m[2], exportUrl, noun: NOUNS[kind] };
}

/** What to tell someone whose document could not be read without signing in. */
export function privateDocMessage(link: Pick<GoogleDocLink, "noun">): string {
  return `This ${link.noun} is private, so it cannot be read. In Google, choose Share, set General access to "Anyone with the link" (Viewer), and add it again. The app never signs in to Google. You can also File > Download and upload the file, or paste its text.`;
}

/** The document name from an export's Content-Disposition header, without the extension Google adds. */
export function titleFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)?.[1];
  let name: string | undefined;
  try {
    name = star ? decodeURIComponent(star) : undefined;
  } catch {
    name = undefined;
  }
  name ??= /filename\s*=\s*"?([^";]+)"?/.exec(header)?.[1];
  const title = name?.replace(/\.(txt|csv)$/i, "").trim();
  return title || null;
}
