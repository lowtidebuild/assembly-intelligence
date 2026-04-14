import { NextRequest, NextResponse } from "next/server";
import { loadRecentAlerts, loadUnreadAlertCount } from "@/lib/alerts";

export async function GET(request: NextRequest) {
  const limitParam = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "10",
    10,
  );
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 10;

  const [items, unreadCount] = await Promise.all([
    loadRecentAlerts(limit),
    loadUnreadAlertCount(),
  ]);

  return NextResponse.json({
    unreadCount,
    items,
  });
}
