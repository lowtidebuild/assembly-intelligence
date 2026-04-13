import { NextResponse } from "next/server";
import { z } from "zod";
import { callMcpTool } from "@/lib/mcp-client";
import { errorMessage } from "@/lib/api-base";

const querySchema = z.object({
  category: z
    .enum(["legislation", "admin", "interpretation", "opinion"])
    .default("legislation"),
  keyword: z.string().trim().min(1).optional(),
  detailSeq: z.string().trim().min(1).optional(),
  diff: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().max(50).default(1),
  pageSize: z.coerce.number().int().positive().max(20).default(10),
});

function issueStatus(error: string): number {
  if (error.includes("LAWMKING_OC")) return 424;
  return 502;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    category: searchParams.get("category") ?? undefined,
    keyword: searchParams.get("keyword") ?? undefined,
    detailSeq: searchParams.get("detailSeq") ?? undefined,
    diff: searchParams.get("diff") ?? undefined,
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
      "assembly_org",
      {
        type: "lawmaking",
        category: input.category,
        ...(input.keyword ? { keyword: input.keyword } : {}),
        ...(input.detailSeq ? { detail_seq: input.detailSeq } : {}),
        ...(input.diff ? { diff: input.diff } : {}),
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
      source: "assembly_org(type=lawmaking)",
      data: payload,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: errorMessage(err) },
      { status: 500 },
    );
  }
}

