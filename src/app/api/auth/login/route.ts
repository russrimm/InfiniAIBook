import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  SESSION_TTL_SECONDS,
  authPassword,
  createSessionToken,
  requestIsHttps,
  safeEqual,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attempts are checked one at a time, and each failure holds the queue for a
 * growing delay (0.6 s, doubling, capped at 30 s) until a sign-in succeeds.
 * Parallel guesses therefore queue behind each other instead of each paying
 * one short delay, which is what made the old fixed sleep easy to get around.
 * It is per process and in memory, which is all a single-user server needs.
 */
let queue: Promise<unknown> = Promise.resolve();
let consecutiveFailures = 0;

const backoffMs = (failures: number) => Math.min(30_000, 600 * 2 ** (failures - 1));

function serialised<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

export async function POST(req: Request) {
  const password = authPassword();
  if (!password) return NextResponse.json({ ok: true, auth: false });

  const body = (await req.json().catch(() => ({}))) as { password?: string };

  const ok = await serialised(async () => {
    const match = !!body.password && safeEqual(body.password, password);
    consecutiveFailures = match ? 0 : consecutiveFailures + 1;
    // Held inside the queue, so every attempt behind this one waits too.
    if (!match) await new Promise((r) => setTimeout(r, backoffMs(consecutiveFailures)));
    return match;
  });

  if (!ok) return NextResponse.json({ error: "Wrong password." }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await createSessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsHttps(req),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
