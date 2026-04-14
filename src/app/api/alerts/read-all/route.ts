import { NextResponse } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
import { markAllAlertsRead } from "@/lib/alerts";

export async function POST() {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  const updated = await markAllAlertsRead();
  return NextResponse.json({ ok: true, updated });
}
