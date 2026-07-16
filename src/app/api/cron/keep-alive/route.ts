import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { verifyCronRequest } from "@/lib/cron-auth";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message },
      { status: auth.status ?? 401 },
    );
  }

  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (err) {
    console.error("[cron/keep-alive] database ping failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
