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
import { industryCommittee, legislator } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import {
  loadCachedImportance,
  type ImportanceRecord,
} from "@/lib/legislator-importance";
import { loadActiveIndustryProfileCompat, withDbReadRetry } from "@/lib/db-compat";

export const revalidate = 300;

export default async function AssemblyPage() {
  const { committees, importanceById, members, partyStats } =
    await withDbReadRetry(async () => {
      const profile = await loadActiveIndustryProfileCompat();
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
        : new Map<number, ImportanceRecord>();

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
            photoUrl: legislator.photoUrl,
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

      return {
        profile,
        committees,
        importanceById,
        members,
        partyStats,
      };
    });

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
    photoUrl: m.photoUrl,
    committees: m.committees ?? [],
    importance: importanceById.get(m.id)?.level ?? null,
    importanceReasons: importanceById.get(m.id)?.reasons ?? [],
  }));

  const totalActive = members.length;
  const sortedParties = [...partyStats].sort((a, b) => b.count - a.count);
  const watchedCommitteeNames = committees.map((c) => c.committeeCode);
  const leadershipCards = buildLeadershipCards(
    members,
    watchedCommitteeNames,
  );

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
            detailHrefBase="/legislators"
            detailHrefMode="path"
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

        {leadershipCards.length > 0 && (
          <div className="mt-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3">
              <h3 className="text-[13px] font-bold text-[var(--color-text)]">
                관심 위원회 리더십
              </h3>
              <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                위원장/간사 중심 요약
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {leadershipCards.map((card) => (
                <div
                  key={card.committee}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3"
                >
                  <div className="mb-2 text-[12px] font-bold text-[var(--color-text)]">
                    {card.committee}
                  </div>
                  <div className="space-y-1 text-[11px] text-[var(--color-text-secondary)]">
                    {card.leaders.map((leader) => (
                      <div key={`${card.committee}-${leader.name}-${leader.role}`}>
                        <span className="font-semibold text-[var(--color-primary)]">
                          {leader.role}
                        </span>
                        <span className="ml-1 text-[var(--color-text)]">
                          {leader.name}
                        </span>
                        <span className="ml-1 text-[var(--color-text-tertiary)]">
                          ({leader.party})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

type AssemblyMemberRow = {
  id: number;
  memberId: string;
  name: string;
  nameHanja: string | null;
  party: string;
  district: string | null;
  electionType: string | null;
  termNumber: number | null;
  committeeRole: string | null;
  committees: string[];
  photoUrl: string | null;
};

function buildLeadershipCards(
  members: AssemblyMemberRow[],
  watchedCommitteeNames: string[],
) {
  const targetCommittees =
    watchedCommitteeNames.length > 0
      ? watchedCommitteeNames
      : Array.from(
          new Set(
            members
              .flatMap((member) => member.committees)
              .filter(Boolean),
          ),
        ).slice(0, 4);

  return targetCommittees
    .map((committee) => {
      const leaders = members
        .filter(
          (member) =>
            member.committees.includes(committee) &&
            member.committeeRole &&
            member.committeeRole !== "위원",
        )
        .sort((left, right) => rolePriority(right.committeeRole) - rolePriority(left.committeeRole))
        .map((member) => ({
          name: member.name,
          party: member.party,
          role: member.committeeRole ?? "위원",
        }));

      return {
        committee,
        leaders,
      };
    })
    .filter((entry) => entry.leaders.length > 0);
}

function rolePriority(role: string | null | undefined) {
  if (role === "위원장") return 3;
  if (role === "간사") return 2;
  if (role === "위원") return 1;
  return 0;
}
