import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const mod = await import("../src/lib/mcp-client");
  const api = mod.default ?? mod;
  const queries = ["회의록", "상임위 회의록", "본회의 회의록", "속기록"];

  for (const query of queries) {
    try {
      const result = await api.callMcpTool("discover_apis", { query });
      console.log(`\n=== discover_apis: ${query} ===`);
      console.log(JSON.stringify(result, null, 2).slice(0, 4000));
    } catch (error) {
      console.error(`discover_apis failed for "${query}"`, error);
    }
  }

  const meetingProbes = [
    { type: "meeting", age: 22, page_size: 3 },
    { type: "meeting", age: 22, page_size: 3, keyword: "게임" },
    { type: "meeting", age: 22, page_size: 3, committee: "문화체육관광위원회" },
  ];

  for (const args of meetingProbes) {
    try {
      const result = await api.callMcpTool("assembly_session", args);
      console.log(`\n=== assembly_session: ${JSON.stringify(args)} ===`);
      console.log(JSON.stringify(result, null, 2).slice(0, 4000));
    } catch (error) {
      console.error(`assembly_session meeting probe failed`, args, error);
    }
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
