import { NextRequest, NextResponse } from "next/server";
import { demoGuardResponse } from "@/lib/demo-mode";
import { markAlertRead } from "@/lib/alerts";

export async function POST(request: NextRequest) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  let payload: { id?: number };
  try {
    payload = (await request.json()) as { id?: number };
  } catch {
    return NextResponse.json(
      { error: { message: "잘못된 요청 본문입니다." } },
      { status: 400 },
    );
  }

  if (!Number.isFinite(payload.id)) {
    return NextResponse.json(
      { error: { message: "id가 필요합니다." } },
      { status: 400 },
    );
  }

  await markAlertRead(payload.id!);
  return NextResponse.json({ ok: true });
}
