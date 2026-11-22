import { NextResponse } from "next/server";
import { readLimitedText } from "@/lib/bodylimits";
import { formatCspReports } from "@/lib/cspreport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** At most this many report lines are logged per minute, so a noisy page cannot flood the log. */
const MAX_LINES_PER_MINUTE = 30;
let windowStart = 0;
let logged = 0;

/**
 * Receives the browser's Content Security Policy violation reports (the
 * policy is report-only, see docs/csp.md) and writes one short line for each.
 * Nothing is stored, and only the parts a person needs to see what to fix are
 * kept: the directive, the blocked address without its query, and the page.
 */
export async function POST(req: Request) {
  try {
    const raw = await readLimitedText(req, 16 * 1024);
    const now = Date.now();
    if (now - windowStart > 60_000) {
      windowStart = now;
      logged = 0;
    }
    for (const line of formatCspReports(raw)) {
      if (logged >= MAX_LINES_PER_MINUTE) break;
      logged++;
      console.warn(line);
    }
  } catch {
    // A malformed or oversized report is dropped; the browser does not retry.
  }
  return new NextResponse(null, { status: 204 });
}
