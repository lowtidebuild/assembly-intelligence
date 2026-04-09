import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpToolOrThrow } from "../src/lib/mcp-client";

async function main() {
  for (const size of [295, 200, 150]) {
    console.log(`\n── page_size=${size} ──`);
    const t0 = Date.now();
    try {
      const resp = await callMcpToolOrThrow<{
        total?: number;
        returned?: number;
        items?: unknown[];
      }>("query_assembly", {
        api_code: "nwvrqwxyaytdsfvhu",
        params: { AGE: 22 },
        page_size: size,
      });
      const dt = Date.now() - t0;
      console.log(
        `  ${dt}ms total=${resp.total} returned=${resp.returned} items=${resp.items?.length ?? 0}`,
      );
      if (resp.items?.length === 295) {
        console.log("  ✅ got all 295 in one call!");
        break;
      }
    } catch (err) {
      console.error(`  err: ${String(err).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
