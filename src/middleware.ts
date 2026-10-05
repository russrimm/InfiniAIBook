import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authPassword, bearerAllowed, verifySessionToken } from "@/lib/auth";
import { hostAllowed, isCrossSiteWrite, parseAllowedHosts } from "@/lib/access";
import { FailureThrottle } from "@/lib/throttle";

const bearerThrottle = new FailureThrottle();

function refuse(pathname: string, status: number, error: string, code: string) {
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error, code }, { status });
  }
  return new NextResponse(error, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Two checks run first, on every page and API route:
 *
 *  - Without INFINIAIBOOK_PASSWORD (or whenever ALLOWED_HOSTS is set), only
 *    loopback names and ALLOWED_HOSTS are served, so a DNS-rebinding page
 *    cannot read this app from the user's own browser.
 *  - State-changing API requests a browser sends from another site are
 *    refused (CSRF). Clients that send no Origin / Sec-Fetch-Site are not
 *    browsers and pass.
 *
 * With INFINIAIBOOK_PASSWORD set, every page and API route requires either the
 * signed session cookie from /login or INFINIAIBOOK_API_TOKEN. The password is
 * accepted as a bearer token only when INFINIAIBOOK_ALLOW_PASSWORD_BEARER is
 * set. Without a password, only the two checks above apply.
 */
export async function middleware(req: NextRequest) {
  const password = authPassword();
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host");

  const allowedRaw = process.env.ALLOWED_HOSTS?.trim();
  if ((!password || allowedRaw) && !hostAllowed(host, parseAllowedHosts(allowedRaw))) {
    return refuse(
      pathname,
      403,
      `This server does not answer to "${host ?? ""}". Add the hostname to ALLOWED_HOSTS, and set INFINIAIBOOK_PASSWORD before exposing it beyond this machine.`,
      "host"
    );
  }

  if (pathname.startsWith("/api/")) {
    const trustProxy = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? "");
    const forwarded = trustProxy ? req.headers.get("x-forwarded-host") : null;
    if (
      isCrossSiteWrite({
        method: req.method,
        secFetchSite: req.headers.get("sec-fetch-site"),
        origin: req.headers.get("origin"),
        sameHosts: [host ?? "", forwarded ?? ""],
      })
    ) {
      return refuse(pathname, 403, "Cross-site request blocked.", "csrf");
    }
  }

  if (!password) return NextResponse.next();

  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  // The session cookie is an HMAC and cannot be guessed, so it is checked first
  // and never waits behind failed bearer attempts (a proxy that forwards its
  // own Authorization header must not slow down signed-in users).
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && (await verifySessionToken(cookie, password))) return NextResponse.next();

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) {
    // Bearer guesses go through the same back-off as /login, or they would be
    // a way to try passwords at full speed.
    if (bearerThrottle.saturated) {
      return refuse(pathname, 429, "Too many failed sign-in attempts. Try again shortly.", "auth_throttled");
    }
    if (await bearerThrottle.attempt(() => bearerAllowed(bearer, password))) {
      return NextResponse.next();
    }
  }

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
