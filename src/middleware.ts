import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authPassword, safeEqual, sessionToken } from "@/lib/auth";

/**
 * With INFINIAIBOOK_PASSWORD set, every page and API route requires either the
 * session cookie from /login or `Authorization: Bearer <password>` (for
 * scripts using the REST API). Without it, nothing changes.
 */
export async function middleware(req: NextRequest) {
  const password = authPassword();
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer && safeEqual(bearer, password)) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && safeEqual(cookie, await sessionToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required", code: "auth" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
