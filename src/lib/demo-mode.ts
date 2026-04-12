/**
 * Demo mode — single env var controls read-only public access.
 *
 * When DEMO_MODE=true:
 *   - Middleware skips authentication (no login required)
 *   - All server actions become no-ops (no DB writes)
 *   - API POST/PUT/DELETE routes return 403
 *   - Edit buttons are hidden or disabled in the UI
 *
 * This lets us deploy a public-facing demo that shares the same
 * DB as production (read-only) without risk of data corruption.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/**
 * Returns a 403 JSON response for write attempts in demo mode.
 * Use at the top of any API route handler that mutates data.
 */
export function demoGuardResponse(): Response | null {
  if (!isDemoMode()) return null;
  return Response.json(
    { error: { message: "데모 모드에서는 변경할 수 없습니다." } },
    { status: 403 },
  );
}
