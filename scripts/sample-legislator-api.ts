/**
 * Save a representative sample of nwvrqwxyaytdsfvhu (전체 의원 현황) for
 * reference during sync.ts rewrite. This is the stable API that gives us:
 *   - MONA_CD  (stable member ID — primary key candidate)
 *   - HJ_NM    (한자 이름)
 *   - CMITS    (모든 소속위원회, comma-separated)
 *   - REELE_GBN_NM (초선/재선/3선/...)
 *   - UNITS    (대수 이력)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { callMcpTool } from "../src/lib/mcp-client";

async function main() {
  const result = await callMcpTool("query_assembly", {
    api_code: "nwvrqwxyaytdsfvhu",
    params: { AGE: 22 },
    page_size: 5,
  });

  const out = resolve("docs/mcp-samples/10-legislator-all.json");
  writeFileSync(out, JSON.stringify(result, null, 2), "utf-8");
  console.log(`saved ${out}`);

  // Also grab total count
  const count = await callMcpTool("query_assembly", {
    api_code: "nwvrqwxyaytdsfvhu",
    params: {},
    page_size: 1,
  });
  console.log(
    `total legislators available: ${(count as { total?: number })?.total ?? "?"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
