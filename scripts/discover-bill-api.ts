import { config } from "dotenv";
config({ path: ".env.local" });
import { callMcpTool } from "../src/lib/mcp-client";

async function main() {
  console.log("── discover_apis — search 'bill' ──");
  const discoverRes = await callMcpTool("discover_apis", {
    keyword: "bill",
    limit: 30,
  });
  console.log(JSON.stringify(discoverRes, null, 2));

  console.log("\n\n── discover_apis — search '의안' ──");
  const discoverKoRes = await callMcpTool("discover_apis", {
    keyword: "의안",
    limit: 30,
  });
  console.log(JSON.stringify(discoverKoRes, null, 2));

  console.log("\n\n── discover_apis — search '법안' ──");
  const discoverLaw = await callMcpTool("discover_apis", {
    keyword: "법안",
    limit: 30,
  });
  console.log(JSON.stringify(discoverLaw, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
