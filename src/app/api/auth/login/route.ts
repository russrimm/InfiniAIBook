import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  SESSION_TTL_SECONDS,
  authPassword,
  createSessionToken,
  requestIsHttps,
  safeEqual,
} from "@/lib/auth";

import { authThrottle, clientKey } from "@/lib/clientthrottle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Failures hold their own client's queue for a growing delay; see ClientThrottle. */
export async function POST(req: Request) {
  const password = authPassword();
  if (!password) return NextResponse.json({ ok: true, auth: false });

  const body = (await req.json().catch(() => ({}))) as { password?: string };

  const throttles = authThrottle();
  const throttle = throttles.forClient(clientKey(req.headers));
  if (throttle.saturated || throttles.overloaded) {
    return NextResponse.json(
      { error: "Too many failed sign-in attempts. Try again shortly.", code: "auth_throttled" },
      { status: 429 }
    );
  }
  const ok = await throttle.attempt(
    () => typeof body.password === "string" && !!body.password && safeEqual(body.password, password)
  );

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
