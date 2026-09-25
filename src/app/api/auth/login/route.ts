import { NextResponse } from "next/server";
import { AUTH_COOKIE, authPassword, safeEqual, sessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = authPassword();
  if (!password) return NextResponse.json({ ok: true, auth: false });

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !safeEqual(body.password, password)) {
    // A small fixed delay makes guessing from a script slower without
    // needing any state.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(req.url).protocol === "https:",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
