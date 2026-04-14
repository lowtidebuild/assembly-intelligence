/**
 * /setup — setup wizard entry point.
 *
 * NOT inside the (dashboard) layout because:
 *   1. The sidebar depends on an active IndustryProfile — which is
 *      exactly what we're creating here.
 *   2. Wizard needs full-width real estate.
 *
 * Server component. Loads everything the wizard needs upfront so the
 * client component renders synchronously after hydration:
 *   - All industry presets (thin, ~5KB total)
 *   - Existing IndustryProfile (for edit mode) + its committees + watches
 *   - All active legislators for the hemicycle picker
 *   - All 19 committees from assembly-committees.ts
 *
 * If legislators are missing (fresh deploy), the wizard surfaces a
 * "의원 데이터 가져오기" button that calls /api/setup/sync-legislators.
 */

import { db } from "@/db";
import {
  industryCommittee,
  industryLegislatorWatch,
  legislator,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { INDUSTRY_PRESETS, getPreset } from "@/lib/industry-presets";
import { ALL_COMMITTEES } from "@/lib/assembly-committees";
import { SetupWizard } from "@/components/setup-wizard";
import { loadActiveIndustryProfileCompat } from "@/lib/db-compat";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [profileRows, allLegislators] = await Promise.all([
    loadActiveIndustryProfileCompat().then((profile) => (profile ? [profile] : [])),
    db
      .select({
        id: legislator.id,
        memberId: legislator.memberId,
        name: legislator.name,
        party: legislator.party,
        district: legislator.district,
        committees: legislator.committees,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true))
      .orderBy(asc(legislator.seatIndex)),
  ]);

  const existingProfile = profileRows[0] ?? null;

  // If editing, also load the committees and watched legislators for
  // the existing profile so we can pre-check them.
  let existingCommittees: string[] = [];
  let existingWatchedIds: number[] = [];
  if (existingProfile) {
    const [committees, watches] = await Promise.all([
      db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, existingProfile.id)),
      db
        .select({ legislatorId: industryLegislatorWatch.legislatorId })
        .from(industryLegislatorWatch)
        .where(
          eq(industryLegislatorWatch.industryProfileId, existingProfile.id),
        ),
    ]);
    existingCommittees = committees.map((c) => c.committeeCode);
    existingWatchedIds = watches.map((w) => w.legislatorId);
  }

  return (
    <SetupWizard
      presets={Object.values(INDUSTRY_PRESETS).map((p) => ({
        slug: p.slug,
        name: p.name,
        nameEn: p.nameEn,
        icon: p.icon,
        description: p.description,
        keywords: p.keywords,
        excludeKeywords: p.excludeKeywords,
        suggestedCommittees: p.suggestedCommittees,
        llmContext: p.llmContext,
        presetVersion: p.presetVersion,
      }))}
      allCommittees={ALL_COMMITTEES}
      allLegislators={allLegislators.map((l) => ({
        id: l.id,
        memberId: l.memberId,
        name: l.name,
        party: l.party,
        district: l.district,
        committees: l.committees ?? [],
      }))}
      existingProfile={
        existingProfile
          ? {
              slug: existingProfile.slug,
              name: existingProfile.name,
              nameEn: existingProfile.nameEn,
              icon: existingProfile.icon,
              description: existingProfile.description,
              keywords: existingProfile.keywords,
              excludeKeywords:
                existingProfile.excludeKeywords.length > 0
                  ? existingProfile.excludeKeywords
                  : (getPreset(existingProfile.slug)?.excludeKeywords ?? []),
              llmContext: existingProfile.llmContext,
              presetVersion: existingProfile.presetVersion,
              committees: existingCommittees,
              legislatorIds: existingWatchedIds,
            }
          : null
      }
    />
  );
}
