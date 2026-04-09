import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpTool } from "../src/lib/mcp-client";

async function main() {
  const billIds = [
    "PRC_I2I5R1P1P1O2P0N9N1V7U1U7S6T0S2", // 게임산업진흥, 2026-03-30
    "PRC_F2F6N0N3M1M2L1L4K3K4S3S0R8P6Q4", // 사행산업, 2026-03-30
    "PRC_H2F6E0E3N2L3K1J1J1F2E3C4B2C4K9", // 관광진흥법, 2026-03-30
  ];

  for (const id of billIds) {
    const res = (await callMcpTool("assembly_bill", { bill_id: id })) as {
      items?: Array<{
        의안명?: string;
        제안이유?: string | null;
        주요내용?: string | null;
        심사경과?: { 소관위_회부일?: string | null };
      }>;
    } | null;
    const item = res?.items?.[0];
    console.log(`\n${id}`);
    console.log(`  의안명: ${item?.의안명}`);
    console.log(
      `  제안이유: ${item?.제안이유 ? "[" + String(item.제안이유).slice(0, 120) + "...]" : "null"}`,
    );
    console.log(
      `  주요내용: ${item?.주요내용 ? "[" + String(item.주요내용).slice(0, 120) + "...]" : "null"}`,
    );
    console.log(
      `  심사경과.소관위_회부일: ${item?.심사경과?.소관위_회부일 ?? "null"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
