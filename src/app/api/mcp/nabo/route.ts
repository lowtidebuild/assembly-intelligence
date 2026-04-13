import { NextResponse } from "next/server";
import { z } from "zod";
import { callMcpTool, hasMcpKey } from "@/lib/mcp-client";
import { errorMessage } from "@/lib/api-base";

const querySchema = z.object({
  type: z.enum(["report", "periodical", "recruitments"]).default("report"),
  keyword: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().max(50).default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(10),
});

function issueStatus(error: string): number {
  if (error.includes("NABO_API_KEY")) return 424;
  return 502;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasMcpKey()) {
    return NextResponse.json(
      {
        ok: false,
        disabled: true,
        error:
          "ASSEMBLY_API_MCP_KEY가 없어 NABO probe를 건너뛰었습니다. mock-data/read-only 데모에서는 정상입니다.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    type: searchParams.get("type") ?? undefined,
    keyword: searchParams.get("keyword") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  try {
    const input = parsed.data;
    const payload = await callMcpTool<Record<string, unknown>>(
      "get_nabo",
      {
        type: input.type,
        ...(input.keyword ? { keyword: input.keyword } : {}),
        page: input.page,
        page_size: input.pageSize,
      },
      { profile: "full" },
    );

    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
    ) {
      return NextResponse.json(payload, { status: issueStatus(payload.error) });
    }

    return NextResponse.json({
      ok: true,
      source: "get_nabo",
      data: payload,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err) },
      { status: 500 },
    );
  }
}
