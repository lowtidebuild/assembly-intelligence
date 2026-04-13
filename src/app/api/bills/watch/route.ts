import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { demoGuardResponse } from "@/lib/demo-mode";
import { trackBillForActiveProfile } from "@/lib/bill-monitoring";

const PAGES_TO_REVALIDATE = [
  "/briefing",
  "/radar",
  "/impact",
  "/watch",
  "/assembly",
];

interface WatchBillPayload {
  billId?: string;
  billNumber?: string | null;
  billName?: string;
  proposerName?: string;
  committee?: string | null;
  proposalDate?: string | null;
}

function revalidateAll() {
  for (const path of PAGES_TO_REVALIDATE) {
    revalidatePath(path);
  }
}

export async function POST(request: NextRequest) {
  const blocked = demoGuardResponse();
  if (blocked) return blocked;

  let payload: WatchBillPayload;
  try {
    payload = (await request.json()) as WatchBillPayload;
  } catch {
    return NextResponse.json(
      { error: { message: "잘못된 요청 본문입니다." } },
      { status: 400 },
    );
  }

  if (!payload.billId || !payload.billName || !payload.proposerName) {
    return NextResponse.json(
      { error: { message: "billId, billName, proposerName 이 필요합니다." } },
      { status: 400 },
    );
  }

  try {
    const result = await trackBillForActiveProfile({
      billId: payload.billId,
      billNumber: payload.billNumber ?? null,
      billName: payload.billName,
      proposerName: payload.proposerName,
      committee: payload.committee ?? null,
      proposalDate: payload.proposalDate ?? null,
    });

    revalidateAll();

    return NextResponse.json({
      ok: true,
      id: result.id,
      billId: result.billId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "법안 모니터링 추가에 실패했습니다.";
    return NextResponse.json(
      { error: { message } },
      { status: 500 },
    );
  }
}
