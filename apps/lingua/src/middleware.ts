import { NextResponse, type NextRequest } from "next/server";
import { basicAuthOk, hostAllowed, isCrossSiteWrite, parseAllowedHosts } from "@/lib/access";

/**
 * - Without LINGUA_PASSWORD (or whenever ALLOWED_HOSTS is set), only loopback
 *   names and ALLOWED_HOSTS are served, against DNS rebinding.
 * - State-changing API requests from another site are refused (CSRF).
 * - With LINGUA_PASSWORD set, every request needs HTTP Basic auth with that
 *   password (any username).
 */
export function middleware(req: NextRequest) {
  const password = process.env.LINGUA_PASSWORD?.trim();
  const host = req.headers.get("host");
  const allowedRaw = process.env.ALLOWED_HOSTS?.trim();

  if ((!password || allowedRaw) && !hostAllowed(host, parseAllowedHosts(allowedRaw))) {
    return new NextResponse(
      `This server does not answer to "${host ?? ""}". Add it to ALLOWED_HOSTS, and set LINGUA_PASSWORD before exposing Lingua beyond this machine.`,
      { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
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
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  if (password && !basicAuthOk(req.headers.get("authorization"), password)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Lingua", charset="UTF-8"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
