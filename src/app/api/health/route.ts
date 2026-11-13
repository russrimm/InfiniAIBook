import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store" };

/**
 * Liveness and readiness for container probes and the post-deploy smoke test.
 * The middleware serves it without a session, so the body is only a status:
 * no version, paths, configuration or error text.
 */
export async function GET() {
  try {
    db.prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok" }, { headers: HEADERS });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: HEADERS });
  }
}
