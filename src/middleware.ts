/**
 * Shared-password gate middleware.
 *
 * Any request not matching a public-path prefix requires a valid
 * auth cookie (see src/lib/auth.ts for token format). Failures
 * redirect to /login?return_to=<original-path>.
 *
 * ── Public paths ──────────────────────────────────────────
 *   /login              — the login page itself
 *   /api/auth/*         — login + logout POST handlers
 *   /api/cron/*         — uses Bearer CRON_SECRET (cron-auth.ts)
 *   /api/health         — uptime probe, no sensitive data
 *   /_next, /favicon.*  — static assets (excluded via matcher)
 *
 * ── Dev bypass ────────────────────────────────────────────
 * When APP_PASSWORD is unset in dev, auth.getAuthMode() returns
 * enforced=false and we let everything through with a console
 * warning on first request.
 *
 * ── Why a separate middleware.ts ──────────────────────────
 * Edge runtime, no Node.crypto. We use Web Crypto via the
 * helpers in src/lib/auth.ts. Middleware matchers exclude
 * _next/* and static assets so we don't pay the HMAC verify
 * cost for every CSS file.
 */

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, RETURN_TO_PARAM, getAuthMode, verifyToken } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/cron",
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

let devBypassWarned = false;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname) || isDemoMode()) {
    return NextResponse.next();
  }

  let mode: ReturnType<typeof getAuthMode>;
  try {
    mode = getAuthMode();
  } catch (err) {
    // Hard production fail — throw becomes a 500, which is correct.
    console.error("[middleware] auth config error:", err);
    return new NextResponse("Auth misconfigured", { status: 500 });
  }

  if (!mode.enforced) {
    if (!devBypassWarned) {
      console.warn(
        "[middleware] APP_PASSWORD not set — auth disabled (dev mode)",
      );
      devBypassWarned = true;
    }
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return redirectToLogin(req, pathname, search);
  }

  const result = await verifyToken(mode.password!, token);
  if (!result.ok) {
    // Drop the bad cookie on the way to login so stale tokens don't
    // cause an infinite loop after password rotation.
    const res = redirectToLogin(req, pathname, search);
    res.cookies.delete(AUTH_COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}

function redirectToLogin(
  req: NextRequest,
  pathname: string,
  search: string,
): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set(RETURN_TO_PARAM, pathname + search);
  return NextResponse.redirect(url);
}

/**
 * Run on everything except Next internals, static files, and the
 * favicon. Public paths are still matched but short-circuited
 * inside the middleware body (cheaper than listing them here and
 * keeps the "API is authenticated by default" invariant obvious).
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|demo/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
