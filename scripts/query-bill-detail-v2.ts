/**
 * Query 의안 상세정보 via query_assembly using the correct `api_code` param.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpTool } from "../src/lib/mcp-client";

async function main() {
  const billId = "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2"; // 게임산업진흥
  // 알려진 코드 후보들 (discover_apis 리턴값의 INF_ID + ALLSCHEDULE/BILLRCP 같은 레거시)
  const codes = [
    // discover_apis의 INF_ID
    "OOWY4R001216HX11461", // 의안 상세정보
    "OOWY4R001216HX11460", // 의안 제안자정보
    "OOWY4R001216HX11462", // 의안 심사정보 (예결산 제외)
    "OOWY4R001216HX11536", // 의안정보 통합 API
    "OOWY4R001216HX11440", // 의안정보 통합 API (dup)
    // 레거시 코드 후보
    "BILLRCP",
    "BILLINFO",
    "BILLDETAIL",
    "nwvrqwxyaytdsfvhu",
  ];

  for (const code of codes) {
    console.log(`\n── api_code=${code} ──`);
    try {
      const res = await callMcpTool("query_assembly", {
        api_code: code,
        params: { BILL_ID: billId, AGE: 22 },
      });
      const str = JSON.stringify(res, null, 2);
      console.log(str.length > 2000 ? str.slice(0, 2000) + "\n... (truncated)" : str);
    } catch (err) {
      console.error("  err:", String(err).slice(0, 200));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
