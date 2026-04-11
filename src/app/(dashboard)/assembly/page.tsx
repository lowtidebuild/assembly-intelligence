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
import { computeImportance } from "@/lib/legislator-importance";

export const dynamic = "force-dynamic";

export default async function AssemblyPage() {
  const [profile] = await db.select().from(industryProfile).limit(1);
  const committees = profile
    ? await db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];
  const importanceById = profile
    ? await computeImportance({
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

  const totalActive = members.length;
  const sortedParties = [...partyStats].sort((a, b) => b.count - a.count);

  return (
    <>
      <PageHeader
        title="국회 현황"
        subtitle={`제22대 국회 · ${totalActive}명 활동 중`}
      />

      <div className="mx-auto grid max-w-[1100px] grid-cols-[1fr_280px] gap-8 p-6">
        {/* Hemicycle */}
        <div className="flex flex-col items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-center">
            <h2 className="text-[14px] font-bold text-[var(--color-text)]">
              본회의장 의석 배치
            </h2>
            <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
              정당별 3-sector 배치 · 산업 관련 위원/발의 의원은 outline ring으로 강조
            </p>
          </div>
          <Hemicycle members={hemicycleMembers} width={720} />
        </div>

        {/* Sidebar stats */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
              정당별 의석
            </h3>
            <ul className="space-y-2 text-[13px]">
              {sortedParties.map((p) => {
                const pct = ((p.count / totalActive) * 100).toFixed(1);
                return (
                  <li
                    key={p.party}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-[var(--color-text)]">
                      {p.party}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span className="font-semibold text-[var(--color-text)]">
                        {p.count}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {pct}%
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[12px] text-[var(--color-text-secondary)]">
            <strong className="mb-1 block text-[var(--color-text)]">
              💡 팁
            </strong>
            의석을 클릭하면 의원 상세 프로필이 열립니다. 산업별 워치리스트에
            추가하려면 의원 워치 페이지에서 진행하세요.
          </div>
        </aside>
      </div>
    </>
  );
}
