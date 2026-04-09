import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpToolOrThrow } from "../src/lib/mcp-client";

async function main() {
  for (let page = 1; page <= 4; page++) {
    console.log(`\n── page ${page} ──`);
    const t0 = Date.now();
    const resp = await callMcpToolOrThrow<{
      total?: number;
      returned?: number;
      items?: Array<{ HG_NM?: string; MONA_CD?: string }>;
    }>("query_assembly", {
      api_code: "nwvrqwxyaytdsfvhu",
      params: { AGE: 22 },
      page,
      page_size: 100,
    });
    const dt = Date.now() - t0;
    console.log(
      `  ${dt}ms total=${resp.total} returned=${resp.returned} items=${resp.items?.length ?? 0}`,
    );
    if ((resp.items?.length ?? 0) < 100) break;
  }
  console.log("\n✅ done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
