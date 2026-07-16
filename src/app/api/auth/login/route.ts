/**
 * POST /api/auth/login
 *
 * Accepts form data (from the login page form) or JSON with:
 *   - password    : submitted password
 *   - return_to   : where to redirect on success (defaults to /briefing)
 *
 * On success: sets the auth cookie + 303 redirects to return_to.
 * On failure: 303 redirects to /login?error=<code>&return_to=<path>
 *
 * We use 303 instead of 302 so the form POST becomes a GET on the
 * redirect target — browsers handle this correctly for login flows.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  RETURN_TO_PARAM,
  buildAuthCookieOptions,
  getAuthMode,
  signToken,
  timingSafePasswordCompare,
} from "@/lib/auth";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_MAX_TRACKED_IPS = 1_000;
const failedLoginAttempts = new Map<string, number[]>();

function currentFailures(ip: string, now: number): number[] {
  const cutoff = now - LOGIN_WINDOW_MS;
  const recent = (failedLoginAttempts.get(ip) ?? []).filter(
    (timestamp) => timestamp > cutoff,
  );
  if (recent.length === 0) {
    failedLoginAttempts.delete(ip);
  } else {
    failedLoginAttempts.set(ip, recent);
  }
  return recent;
}

export function isLoginRateLimited(ip: string, now = Date.now()): boolean {
  return currentFailures(ip, now).length >= LOGIN_MAX_FAILURES;
}

export function recordFailedLoginAttempt(ip: string, now = Date.now()): void {
  const recent = currentFailures(ip, now);
  if (!failedLoginAttempts.has(ip) && failedLoginAttempts.size >= LOGIN_MAX_TRACKED_IPS) {
    const oldestIp = failedLoginAttempts.keys().next().value;
    if (oldestIp) failedLoginAttempts.delete(oldestIp);
  }
  failedLoginAttempts.set(ip, [...recent, now]);
}

export function clearLoginFailures(ip: string): void {
  failedLoginAttempts.delete(ip);
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Only allow same-origin relative paths for the return_to redirect
 * (prevents open-redirect to attacker-controlled hosts).
 */
function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "/briefing";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/briefing";
  if (raw.startsWith("/login")) return "/briefing"; // avoid loops
  return raw;
}

async function parseRequest(req: NextRequest): Promise<{
  password: string | null;
  returnTo: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await req.json()) as {
        password?: unknown;
        return_to?: unknown;
      };
      return {
        password: typeof body.password === "string" ? body.password : null,
        returnTo: sanitizeReturnTo(
          typeof body.return_to === "string" ? body.return_to : null,
        ),
      };
    } catch {
      return { password: null, returnTo: "/briefing" };
    }
  }

  // form-urlencoded (default for <form method="POST">)
  const form = await req.formData();
  const password = form.get("password");
  const returnTo = form.get(RETURN_TO_PARAM);
  return {
    password: typeof password === "string" ? password : null,
    returnTo: sanitizeReturnTo(
      typeof returnTo === "string" ? returnTo : null,
    ),
  };
}

export async function POST(req: NextRequest) {
  const { password, returnTo } = await parseRequest(req);
  const origin = req.nextUrl.origin;
  const ip = clientIp(req);

  const mode = (() => {
    try {
      return getAuthMode();
    } catch (err) {
      console.error("[auth/login] config error:", err);
      return null;
    }
  })();

  if (!mode) {
    return redirectWithError(origin, returnTo, "server");
  }

  // Dev mode: no APP_PASSWORD set, auth disabled upstream.
  // Still accept the form (harmless) and send them on their way.
  if (!mode.enforced) {
    const res = NextResponse.redirect(new URL(returnTo, origin), 303);
    return res;
  }

  if (isLoginRateLimited(ip)) {
    return redirectWithError(origin, returnTo, "rate_limited", 429);
  }

  if (!password) {
    return redirectWithError(origin, returnTo, "missing");
  }

  if (!(await timingSafePasswordCompare(password, mode.password!))) {
    recordFailedLoginAttempt(ip);
    return redirectWithError(origin, returnTo, "bad_password");
  }

  clearLoginFailures(ip);
  const token = await signToken(mode.password!);
  const secure = req.nextUrl.protocol === "https:";

  const res = NextResponse.redirect(new URL(returnTo, origin), 303);
  res.cookies.set({
    ...buildAuthCookieOptions(secure),
    value: token,
  });
  return res;
}

function redirectWithError(
  origin: string,
  returnTo: string,
  code: string,
  status: 303 | 429 = 303,
): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", code);
  if (returnTo !== "/briefing") {
    url.searchParams.set(RETURN_TO_PARAM, returnTo);
  }
  if (status === 429) {
    return new NextResponse(null, {
      status,
      headers: {
        location: url.toString(),
        "retry-after": String(Math.ceil(LOGIN_WINDOW_MS / 1000)),
      },
    });
  }
  return NextResponse.redirect(url, status);
}
