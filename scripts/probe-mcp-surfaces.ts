import { config } from "dotenv";
config({ path: ".env.local" });

import { callMcpTool, hasMcpKey } from "@/lib/mcp-client";

const SAMPLE_BILL_ID = "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2";
const SAMPLE_COMMITTEE = "문화체육관광위원회";

function summarize(value: unknown) {
  if (value == null) return { ok: false, detail: "null" };
  if (typeof value !== "object") {
    return { ok: true, detail: String(value).slice(0, 160) };
  }
  if ("error" in value && typeof (value as { error?: unknown }).error === "string") {
    return { ok: false, detail: (value as { error: string }).error };
  }
  if (
    "items" in value &&
    Array.isArray((value as { items?: unknown[] }).items)
  ) {
    return {
      ok: true,
      total:
        typeof (value as { total?: unknown }).total === "number"
          ? (value as { total: number }).total
          : (value as { items: unknown[] }).items.length,
      sample: (value as { items: unknown[] }).items[0] ?? null,
    };
  }
  return {
    ok: true,
    keys: Object.keys(value as Record<string, unknown>),
  };
}

async function main() {
  if (!hasMcpKey()) {
    console.error("ASSEMBLY_API_MCP_KEY is not set");
    process.exit(1);
  }

  const [trackPayload, billDetailPayload, committeeDetailPayload, petitionDetailPayload, partyStatsPayload] =
    await Promise.all([
      callMcpTool("assembly_bill", {
        bill_id: SAMPLE_BILL_ID,
        mode: "track",
        include_history: true,
      }),
      callMcpTool(
        "bill_detail",
        {
          bill_id: SAMPLE_BILL_ID,
          fields: ["detail", "review", "history", "proposers", "meetings", "lifecycle"],
        },
        { profile: "full" },
      ),
      callMcpTool(
        "committee_detail",
        {
          committee_name: SAMPLE_COMMITTEE,
          include_members: true,
        },
        { profile: "full" },
      ),
      callMcpTool(
        "petition_detail",
        {
          mode: "search",
          status: "pending",
          page_size: 3,
        },
        { profile: "full" },
      ),
      callMcpTool("assembly_member", {
        mode: "party_stats",
        age: 22,
      }),
    ]);

  console.log(
    JSON.stringify(
      {
        billTrack: summarize(trackPayload),
        billDetail: summarize(billDetailPayload),
        committeeDetail: summarize(committeeDetailPayload),
        petitionDetail: summarize(petitionDetailPayload),
        partyStats: summarize(partyStatsPayload),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
