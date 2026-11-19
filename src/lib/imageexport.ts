/**
 * Turning an on-screen artifact into a downloadable picture, and saying why
 * when that fails.
 *
 * The page's Content Security Policy only allows `connect-src` to this origin
 * and the model hosts, so `fetch()` of a `data:` URL is refused with a bare
 * "Failed to fetch". Nothing here fetches: data URLs are decoded directly and
 * the canvas hands back a Blob.
 */

/** The bytes of a `data:` URL, decoded without a network request. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const match = /^data:([^;,]*)((?:;[^;,]+)*),/i.exec(dataUrl);
  if (!match || comma < 0) throw new Error("The picture was not in a format the browser could save.");
  const mime = match[1] || "application/octet-stream";
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(match[2])) {
    const bin = atob(payload);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

/**
 * A message that says what went wrong and what to do. The browser words a
 * blocked or failed request as "Failed to fetch" and gives no reason, so that
 * is translated rather than shown.
 */
export function exportErrorMessage(error: unknown, action = "export an image"): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw || /failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    return `Could not ${action}: the browser blocked or lost a request it needed while drawing it, and gave no further reason. Try again; if it keeps failing, use Export to save the content as Markdown instead.`;
  }
  if (/tainted|insecure|cross-origin|security/i.test(raw)) {
    return `Could not ${action}: the picture contains an image the browser will not let a page copy. Use Export to save the content as Markdown instead.`;
  }
  if (/canvas|memory|too large|size/i.test(raw)) {
    return `Could not ${action}: it is too large for the browser to draw. Use Export to save the content as Markdown instead.`;
  }
  return `Could not ${action}: ${raw}`;
}

export type Rasterized = { blob: Blob; ext: "png" | "svg"; note?: string };

type ToImage = typeof import("html-to-image");

/**
 * Draws a DOM node. A PNG at double resolution is tried first, then at
 * normal resolution (very tall layouts can exceed a browser's canvas limit),
 * then a scalable SVG, so an export is saved whenever the browser can make
 * any picture at all.
 */
export async function rasterize(
  node: HTMLElement,
  backgroundColor: string,
  lib?: Pick<ToImage, "toBlob" | "toSvg">
): Promise<Rasterized> {
  const { toBlob, toSvg } = lib ?? (await import("html-to-image"));
  // Web fonts are already loaded in the document; re-inlining them costs
  // seconds and occasionally fails on cross-origin CSS.
  const base = { backgroundColor, skipFonts: true };
  let last: unknown;
  for (const pixelRatio of [2, 1]) {
    try {
      const blob = await toBlob(node, { ...base, pixelRatio });
      if (blob) return { blob, ext: "png" };
      last = new Error("The browser could not make a canvas that large.");
    } catch (e) {
      last = e;
    }
  }
  try {
    const svg = await toSvg(node, base);
    return {
      blob: dataUrlToBlob(svg),
      ext: "svg",
      note: "The PNG could not be drawn in this browser, so the picture was saved as a scalable SVG instead.",
    };
  } catch {
    throw last instanceof Error ? last : new Error(exportErrorMessage(last));
  }
}
