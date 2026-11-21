import { NextResponse } from "next/server";
import { AUTH_COOKIE, requestIsHttps } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  // Same attributes as the cookie being cleared, including Secure over HTTPS.
  res.cookies.set(AUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: requestIsHttps(req), path: "/", maxAge: 0 });
  return res;
}
