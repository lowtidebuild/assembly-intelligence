import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "edge";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, ts: Date.now() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
