import { NextResponse } from "next/server";
import { getMcpLatestSnapshot } from "@/lib/mcp-latest";
import { errorMessage } from "@/lib/api-base";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim() || "예산";

  try {
    const snapshot = await getMcpLatestSnapshot(keyword);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(err),
      },
      { status: 500 },
    );
  }
}

