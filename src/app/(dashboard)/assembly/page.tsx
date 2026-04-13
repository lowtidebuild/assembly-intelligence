/**
 * /assembly — 국회 현황.
 *
 * The universal-value page that works even before the user picks
 * their industry (design.md §20). Shows:
 *   - Hemicycle with all 295 legislators, colored by party
 *   - Party breakdown stats
 *   - Committee roster (top N committees)
 *
 * Server component. Fetches legislators from DB, orders by
 * seatIndex, passes to the Hemicycle client component.
 */

import { db } from "@/db";
import { industryCommittee, industryProfile, legislator } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import { LegislatorProfileSlideOver } from "@/components/legislator-profile-slide-over";
import { loadCachedImportance } from "@/lib/legislator-importance";

export const revalidate = 300;

export default async function AssemblyPage(props: {
  searchParams: Promise<{ legislator?: string }>;
}) {
  const sp = await props.searchParams;
  const selectedLegislatorId = sp.legislator
    ? Number.parseInt(sp.legislator, 10)
    : null;
  const [profile] = await db.select().from(industryProfile).limit(1);
  const committees = profile
    ? await db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];
  const importanceById = profile
    ? await loadCachedImportance({
        profileId: profile.id,
        committeeCodes: committees.map((c) => c.committeeCode),
      })
    : new Map();

  const [members, partyStats] = await Promise.all([
    db
      .select({
        id: legislator.id,
        memberId: legislator.memberId,
        name: legislator.name,
        nameHanja: legislator.nameHanja,
        party: legislator.party,
        district: legislator.district,
        electionType: legislator.electionType,
        termNumber: legislator.termNumber,
        committeeRole: legislator.committeeRole,
        committees: legislator.committees,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true))
      .orderBy(asc(legislator.seatIndex)),
    db
      .select({
        party: legislator.party,
        count: sql<number>`count(*)::int`,
      })
      .from(legislator)
      .where(eq(legislator.isActive, true))
      .groupBy(legislator.party),
  ]);

  const hemicycleMembers: HemicycleMember[] = members.map((m) => ({
    id: m.id,
    memberId: m.memberId,
    name: m.name,
    nameHanja: m.nameHanja,
    party: m.party,
    district: m.district,
    electionType: m.electionType,
    termNumber: m.termNumber,
    committeeRole: m.committeeRole,
    committees: m.committees ?? [],
    importance: importanceById.get(m.id)?.level ?? null,
    importanceReasons: importanceById.get(m.id)?.reasons ?? [],
  }));
  const selectedMemberId =
    members.find((member) => member.id === selectedLegislatorId)?.memberId ?? null;

  const totalActive = members.length;
  const sortedParties = [...partyStats].sort((a, b) => b.count - a.count);

  return (
    <>
      <PageHeader
        title="국회 현황"
        subtitle={`제22대 국회 · ${totalActive}명 활동 중`}
      />

      <div className="mx-auto max-w-[1200px] p-6">
        {/* Hemicycle — full width */}
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-6 pt-4 shadow-[var(--shadow-card)]">
          <div className="mb-2 text-center">
            <h2 className="text-[14px] font-bold text-[var(--color-text)]">
              본회의장 의석 배치
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
              의석을 클릭하면 의원 프로필이 열립니다 · 밝은 좌석 = 산업 중요 의원
            </p>
          </div>
          <Hemicycle
            members={hemicycleMembers}
            selectedMemberId={selectedMemberId}
            detailHrefBase="/assembly"
          />
        </div>

        {/* Party stats — horizontal below hemicycle */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {sortedParties.map((p) => {
            const pct = ((p.count / totalActive) * 100).toFixed(1);
            return (
              <div
                key={p.party}
                className="flex flex-col items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  {p.party}
                </span>
                <span className="text-[18px] font-bold text-[var(--color-text)]">
                  {p.count}
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)]">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedLegislatorId && (
        <LegislatorProfileSlideOver
          legislatorId={selectedLegislatorId}
          closeHref="/assembly"
          importance={importanceById.get(selectedLegislatorId) ?? null}
        />
      )}
    </>
  );
}
