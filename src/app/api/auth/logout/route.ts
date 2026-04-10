/**
 * POST /api/auth/logout
 *
 * Clears the auth cookie and redirects to /login.
 *
 * Accepts POST (from the sidebar logout form) or GET (for convenience
 * in browser URL bar during development). Both behave identically.
 */

import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth";

function handle(req: NextRequest) {
  const url = new URL("/login", req.nextUrl.origin);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete(AUTH_COOKIE_NAME);
  return res;
}

export const POST = handle;
export const GET = handle;
