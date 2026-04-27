import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import {
  bill,
  industryBillWatch,
  industryCommittee,
  industryProfile,
} from "../src/db/schema";
import { getPreset } from "../src/lib/industry-presets";
import {
  mergeCommitteesWithMixins,
  mergeExcludesWithMixins,
  mergeKeywordsWithMixins,
} from "../src/lib/law-mixins";
import {
  buildDiscoveryBackfillDecision,
  summarizeDiscoveryBackfill,
} from "../src/lib/discovery-backfill";

const apply = process.argv.includes("--apply");

function log(message: string) {
  console.log(`[backfill-discovery-metadata] ${message}`);
}

async function main() {
  const { db } = await import("../src/db");

  const [profile] = await db.select().from(industryProfile).limit(1);
  if (!profile) {
    throw new Error("No active industry profile found.");
  }

  const committees = await db
    .select({ committeeCode: industryCommittee.committeeCode })
    .from(industryCommittee)
    .where(eq(industryCommittee.industryProfileId, profile.id));
  const profileCommitteeCodes = committees.map((row) => row.committeeCode);
  const profileExcludes =
    profile.excludeKeywords.length > 0
      ? profile.excludeKeywords
      : (getPreset(profile.slug)?.excludeKeywords ?? []);
  const selectedMixins = profile.selectedLawMixins ?? [];
  const effectiveProfile = {
    keywords: mergeKeywordsWithMixins(profile.keywords ?? [], selectedMixins),
    excludeKeywords: mergeExcludesWithMixins(profileExcludes, selectedMixins),
    effectiveCommittees: mergeCommitteesWithMixins(
      profileCommitteeCodes,
      selectedMixins,
    ),
  };

  const watchedRows = await db
    .select({ billId: industryBillWatch.billId })
    .from(industryBillWatch)
    .where(eq(industryBillWatch.industryProfileId, profile.id));
  const watchedBillIds = new Set(watchedRows.map((row) => row.billId));

  const rows = await db
    .select({
      id: bill.id,
      billId: bill.billId,
      billName: bill.billName,
      committee: bill.committee,
      discoverySources: bill.discoverySources,
      discoveryKeywords: bill.discoveryKeywords,
    })
    .from(bill);

  const decisions = rows.map((row) =>
    buildDiscoveryBackfillDecision({
      bill: row,
      profile: effectiveProfile,
      isWatched: watchedBillIds.has(row.billId),
    }),
  );
  const summary = summarizeDiscoveryBackfill(decisions);

  log(`mode=${apply ? "apply" : "dry-run"}`);
  log(`profile=${profile.name} (${profile.slug})`);
  log(
    `bills=${summary.totalBills}, updateCandidates=${summary.updateCandidates}, sourceCoverage=${summary.sourceCoveragePct}%`,
  );
  log(
    `sources: manual_watch=${summary.watchedInferred}, committee=${summary.committeeInferred}, noSource=${summary.noSource}`,
  );
  log(`keywordBackfilled=${summary.keywordBackfilled}`);

  const updates = rows
    .map((row, index) => ({ row, decision: decisions[index] }))
    .filter(({ decision }) => decision.shouldUpdate);

  if (!apply) {
    log("dry-run only. Re-run with --apply to update rows.");
    log(
      `sample=${updates
        .slice(0, 5)
        .map(({ decision }) => decision.billId)
        .join(", ") || "none"}`,
    );
    return;
  }

  const updateIds = updates.map(({ row }) => row.id);
  if (updateIds.length === 0) {
    log("nothing to update.");
    return;
  }

  for (const { row, decision } of updates) {
    await db
      .update(bill)
      .set({
        discoverySources:
          decision.discoverySources.length > 0
            ? decision.discoverySources
            : row.discoverySources,
        discoveryKeywords:
          decision.discoveryKeywords.length > 0
            ? decision.discoveryKeywords
            : row.discoveryKeywords,
      })
      .where(eq(bill.id, row.id));
  }

  log(`updated=${updateIds.length}`);

  const verifyRows = await db
    .select({ id: bill.id })
    .from(bill)
    .where(inArray(bill.id, updateIds));
  log(`verifiedRows=${verifyRows.length}`);
}

main().catch((error) => {
  console.error("[backfill-discovery-metadata] failed", error);
  process.exitCode = 1;
});
