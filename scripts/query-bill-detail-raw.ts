/**
 * Try querying the raw 의안 상세정보 API (INF_ID OOWY4R001216HX11461)
 * via query_assembly to see if 제안이유/주요내용 are reachable.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpTool } from "../src/lib/mcp-client";

async function main() {
  const billId = "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2"; // 게임산업진흥

  // Try the "의안 상세정보" API
  console.log("── query_assembly: 의안 상세정보 ──");
  try {
    const res = await callMcpTool("query_assembly", {
      inf_id: "OOWY4R001216HX11461",
      params: { BILL_ID: billId },
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("  err:", err);
  }

  // Try the unified 의안정보 통합 API
  console.log("\n── query_assembly: 의안정보 통합 API ──");
  try {
    const res = await callMcpTool("query_assembly", {
      inf_id: "OOWY4R001216HX11536",
      params: { BILL_ID: billId },
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("  err:", err);
  }

  // Try the other unified API
  console.log("\n── query_assembly: 의안정보 통합 API (alt) ──");
  try {
    const res = await callMcpTool("query_assembly", {
      inf_id: "OOWY4R001216HX11440",
      params: { BILL_ID: billId },
    });
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("  err:", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
