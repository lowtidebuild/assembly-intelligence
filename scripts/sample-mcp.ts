/**
 * One-off script: sample the real assembly-api-mcp server to learn
 * response shapes for tools we haven't probed yet.
 *
 * Run with:  pnpm tsx scripts/sample-mcp.ts [tool]
 *   tool = bill | bill-detail | session | org | member | all
 *
 * Writes pretty-printed JSON dumps to docs/mcp-samples/<tool>.json
 * so we can diff against docs/mcp-api-reality.md assumptions.
 */

import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local" });

import { callMcpTool, listMcpTools } from "../src/lib/mcp-client";

const OUT_DIR = resolve("docs/mcp-samples");
mkdirSync(OUT_DIR, { recursive: true });

function save(name: string, data: unknown) {
  const path = resolve(OUT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  → saved ${path}`);
}

function preview(label: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split("\n");
  const head = lines.slice(0, 40).join("\n");
  console.log(`\n── ${label} ────────────────────────────`);
  console.log(head);
  if (lines.length > 40) console.log(`... (${lines.length - 40} more lines)`);
}

async function sampleTools() {
  console.log("listing tools...");
  const tools = await listMcpTools();
  save("00-tools-list", tools);
  console.log(`found ${tools.length} tools:`);
  for (const t of tools) console.log(`  - ${t.name}`);
}

async function sampleBillSearch() {
  console.log("\nassembly_bill (search by committee)...");
  const result = await callMcpTool("assembly_bill", {
    committee: "문화체육관광위원회",
    age: 22,
    page: 1,
    page_size: 5,
  });
  save("01-bill-search", result);
  preview("bill search", result);
  return result;
}

async function sampleBillDetail(billId: string) {
  console.log(`\nassembly_bill (detail by bill_id=${billId})...`);
  const result = await callMcpTool("assembly_bill", {
    bill_id: billId,
  });
  save("02-bill-detail", result);
  preview("bill detail", result);
  return result;
}

async function sampleBillTrack() {
  console.log("\nassembly_bill (track mode with keywords)...");
  const result = await callMcpTool("assembly_bill", {
    keywords: "게임,게임산업진흥",
    mode: "track",
    include_history: true,
    age: 22,
    page_size: 3,
  });
  save("03-bill-track", result);
  preview("bill track", result);
}

async function sampleSessionSchedule() {
  console.log("\nassembly_session (schedule today)...");
  const today = new Date().toISOString().slice(0, 10);
  const result = await callMcpTool("assembly_session", {
    type: "schedule",
    date_from: "2026-04-01",
    date_to: "2026-04-30",
    page_size: 10,
  });
  save("04-session-schedule", result);
  preview("session schedule", result);
  return { today, result };
}

async function sampleOrgCommittee() {
  console.log("\nassembly_org (committee + members)...");
  const result = await callMcpTool("assembly_org", {
    type: "committee",
    committee_name: "문화체육관광위원회",
    include_members: true,
    age: 22,
  });
  save("05-org-committee", result);
  preview("org committee", result);
}

async function sampleOrgLegNotice() {
  console.log("\nassembly_org (legislation_notice)...");
  const result = await callMcpTool("assembly_org", {
    type: "legislation_notice",
    age: 22,
    page_size: 5,
  });
  save("06-org-leg-notice", result);
  preview("legislation notice", result);
}

async function sampleMemberByCommittee() {
  console.log("\nassembly_member (committee search)...");
  const result = await callMcpTool("assembly_member", {
    committee: "문화체육관광위원회",
    age: 22,
    page_size: 10,
  });
  save("07-member-committee", result);
  preview("member committee search", result);
}

async function sampleMemberPartyStats() {
  console.log("\nassembly_member (mode=party_stats)...");
  const result = await callMcpTool("assembly_member", {
    mode: "party_stats",
    age: 22,
  });
  save("08-member-party-stats", result);
  preview("member party stats", result);
}

async function sampleSessionVote(billId: string) {
  console.log(`\nassembly_session (vote for bill_id=${billId})...`);
  const result = await callMcpTool("assembly_session", {
    type: "vote",
    bill_id: billId,
  });
  save("09-session-vote", result);
  preview("session vote", result);
}

// ── Main ────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2] ?? "all";

  try {
    if (arg === "tools" || arg === "all") await sampleTools();

    let firstBillId: string | undefined;

    if (arg === "bill" || arg === "all") {
      const searchResult = (await sampleBillSearch()) as
        | { items?: Array<{ 의안ID?: string }> }
        | null;
      firstBillId = searchResult?.items?.[0]?.의안ID;
      console.log(`\n  captured first bill_id: ${firstBillId ?? "(none)"}`);
    }

    if ((arg === "bill-detail" || arg === "all") && firstBillId) {
      await sampleBillDetail(firstBillId);
    }

    if (arg === "bill-track" || arg === "all") await sampleBillTrack();
    if (arg === "session" || arg === "all") await sampleSessionSchedule();
    if (arg === "org" || arg === "all") await sampleOrgCommittee();
    if (arg === "org-notice" || arg === "all") await sampleOrgLegNotice();
    if (arg === "member" || arg === "all") await sampleMemberByCommittee();
    if (arg === "party-stats" || arg === "all") await sampleMemberPartyStats();
    if ((arg === "vote" || arg === "all") && firstBillId) {
      await sampleSessionVote(firstBillId);
    }

    console.log("\n✅ done");
  } catch (err) {
    console.error("\n❌ failed:", err);
    process.exit(1);
  }
}

main();
