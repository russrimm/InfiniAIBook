import * as cheerio from "cheerio";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/http";
import { FETCH_HEADERS, extractFromUrl } from "@/lib/ingest";
import {
  BlockedHostError,
  ResponseTooLargeError,
  readCapped,
  safeFetch,
} from "@/lib/safefetch";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Whether a page may be shown in an iframe.
 *
 * The browser enforces this and nothing on our side can override it, so the
 * answer has to be known before deciding how to show the page. Measured across
 * 28 real sources, 46% refuse — including PMC, arXiv, GitHub and the BBC.
 */
function frameability(xfo: string | null, csp: string | null): string | null {
  if (xfo && /deny|sameorigin/i.test(xfo)) {
    return `the site sends X-Frame-Options: ${xfo.trim()}`;
  }
  const fa = csp?.match(/frame-ancestors([^;]*)/i)?.[1]?.trim();
  if (fa && !/\*/.test(fa)) {
    return `the site restricts frame-ancestors to ${fa.slice(0, 60)}`;
  }
  return null;
}

function normalise(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Links worth offering, so the reader view is navigable rather than a dead end. */
function outboundLinks(html: string, base: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: { href: string; text: string }[] = [];

  $("a[href]").each((_, el) => {
    if (out.length >= 40) return;
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().replace(/\s+/g, " ").trim();
    // Anchors, scripts and bare icons carry nothing a person can choose from.
    if (!text || text.length < 3 || text.length > 90) return;
    if (/^(#|javascript:|mailto:|tel:)/i.test(href)) return;
    let abs: string;
    try {
      abs = new URL(href, base).toString();
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs) || seen.has(abs)) return;
    seen.add(abs);
    out.push({ href: abs, text });
  });

  return out;
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const target = normalise(params.get("url") ?? "");
    if (!target) {
      return NextResponse.json({ error: "Enter a web address." }, { status: 400 });
    }
    const notebookId = params.get("notebookId");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res: Response;
    let finalUrl: string;
    try {
      // Guarded: the address is typed by the user, and a page is free to
      // redirect this request anywhere it likes.
      ({ res, finalUrl } = await safeFetch(target, {
        headers: FETCH_HEADERS,
        signal: controller.signal,
      }));
    } catch (e) {
      if (e instanceof BlockedHostError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      const why =
        (e as Error).name === "AbortError"
          ? "the site did not respond within 20 seconds"
          : "the site could not be reached";
      return NextResponse.json(
        { error: `Could not load that page — ${why}.` },
        { status: 502 }
      );
    } finally {
      clearTimeout(timer);
    }

    const blocked = frameability(
      res.headers.get("x-frame-options"),
      res.headers.get("content-security-policy")
    );
    const ctype = res.headers.get("content-type") ?? "";

    // Already in this notebook? Worth knowing before adding it twice.
    const already = notebookId
      ? (db
          .prepare("SELECT id FROM sources WHERE notebook_id = ? AND url IN (?, ?)")
          .get(notebookId, target, finalUrl) as unknown as { id: string } | undefined)
      : undefined;

    if (!blocked && res.ok) {
      return ok({
        url: finalUrl,
        frameable: true,
        status: res.status,
        alreadyAdded: Boolean(already),
      });
    }

    // Reader fallback. The same extractor indexing uses, so what is shown here
    // is what would actually be stored.
    const body = await readCapped(res)
      .then((b) => b.toString("utf8"))
      .catch(() => "");
    let title = "";
    let text = "";
    let extractError: string | null = null;
    try {
      const ex = await extractFromUrl(finalUrl);
      title = ex.title;
      text = ex.text;
    } catch (e) {
      extractError =
        e instanceof BlockedHostError || e instanceof ResponseTooLargeError
          ? e.message
          : e instanceof Error
            ? e.message
            : "The page could not be read.";
    }

    return ok({
      url: finalUrl,
      frameable: false,
      reason: blocked ?? `the site returned ${res.status}`,
      status: res.status,
      contentType: ctype.split(";")[0]?.trim(),
      title,
      text,
      chars: text.length,
      links: body ? outboundLinks(body, finalUrl) : [],
      extractError,
      alreadyAdded: Boolean(already),
    });
  } catch (e) {
    return fail(e);
  }
}
