import { NextResponse } from "next/server";
import { getMcpLatestSnapshot } from "@/lib/mcp-latest";
import { errorMessage } from "@/lib/api-base";
import { hasMcpKey } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword")?.trim() || "예산";

  if (!hasMcpKey()) {
    return NextResponse.json(
      {
        ok: false,
        disabled: true,
        error:
          "ASSEMBLY_API_MCP_KEY가 없어 최신 MCP capability probe를 건너뛰었습니다. mock-data/read-only 데모에서는 정상입니다.",
      },
      { status: 503 },
    );
  }

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
