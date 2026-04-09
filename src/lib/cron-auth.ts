/**
 * Vercel Cron authentication.
 *
 * Vercel adds an `Authorization: Bearer <CRON_SECRET>` header to
 * every cron invocation. We verify it here to make sure the cron
 * endpoints can't be triggered by random internet traffic.
 *
 * Also allows a dev-mode bypass: when running locally without
 * CRON_SECRET set, any request is allowed (with a console warning).
 *
 * Add CRON_SECRET to .env.local and to Vercel Env Vars when deploying.
 * Vercel auto-injects it into the Bearer header.
 */

import type { NextRequest } from "next/server";

export interface CronAuthResult {
  ok: boolean;
  status?: number;
  message?: string;
}

export function verifyCronRequest(req: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET;

  // Dev mode: no secret set → allow with warning
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        message: "CRON_SECRET not configured",
      };
    }
    console.warn(
      "[cron] CRON_SECRET not set, allowing request in dev mode",
    );
    return { ok: true };
  }

  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return {
      ok: false,
      status: 401,
      message: "unauthorized",
    };
  }

  return { ok: true };
}
