import { config } from "dotenv";
import { inArray } from "drizzle-orm";

config({ path: ".env.local" });

async function main() {
  const dbMod = await import("../src/db");
  const schemaMod = await import("../src/db/schema");
  const mcpMod = await import("../src/lib/mcp-client");
  const photoMod = await import("../src/lib/legislator-photo");

  const api = dbMod.default ?? dbMod;
  const schema = schemaMod.default ?? schemaMod;
  const mcp = mcpMod.default ?? mcpMod;
  const photo = photoMod.default ?? photoMod;

  const { db } = api;
  const { legislator } = schema;
  const names = ["진종오", "김교흥", "임오경"];

  const rows = await db
    .select({
      name: legislator.name,
      memberId: legislator.memberId,
      photoUrl: legislator.photoUrl,
    })
    .from(legislator)
    .where(inArray(legislator.name, names));

  for (const row of rows) {
    const payload = await mcp.callMcpTool("assembly_member", {
      name: row.name,
      age: 22,
      page_size: 1,
    });
    const resolved = await photo.resolveLegislatorPhotoUrl({
      name: row.name,
      memberId: row.memberId,
    });

    console.log(`\n=== ${row.name} (${row.memberId}) ===`);
    console.log("raw photo:", payload?.member?.photo ?? null);
    console.log("resolved:", resolved);
    console.log("stored:", row.photoUrl);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
