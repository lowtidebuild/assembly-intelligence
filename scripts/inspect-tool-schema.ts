import { config } from "dotenv";
config({ path: ".env.local" });
import { listMcpTools } from "../src/lib/mcp-client";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const url = new URL("https://assembly-api-mcp.fly.dev/mcp");
  url.searchParams.set("key", process.env.ASSEMBLY_API_MCP_KEY!);
  url.searchParams.set("profile", "lite");

  const client = new Client(
    { name: "schema-inspector", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);

  const tools = await client.listTools();
  for (const t of tools.tools) {
    console.log(`\n── ${t.name} ──`);
    console.log("description:", t.description?.slice(0, 200));
    console.log(
      "inputSchema:",
      JSON.stringify(t.inputSchema, null, 2).slice(0, 1500),
    );
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
