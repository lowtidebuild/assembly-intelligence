/**
 * /watch — 의원 워치.
 *
 * Shows the legislators in the current industry's watch list +
 * offers adding more via the hemicycle picker.
 *
 * Watch list comes from industry_legislator_watch joined against
 * legislator. For each watched member we show:
 *   - avatar (initials)
 *   - name + party + district + committees
 *   - count of bills they've proposed that matched our industry filter
 *
 * The hemicycle on the right lets the user click to add/remove
 * watch entries (wired to a server action — stubbed for now).
 */

import { db } from "@/db";
import {
  legislator,
  industryLegislatorWatch,
  industryProfile,
  bill,
} from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import { Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const [profileRows] = await Promise.all([
    db.select().from(industryProfile).limit(1),
  ]);
  const profile = profileRows[0];

  const [allMembers, watchRows, billCountsByProposer] = await Promise.all([
    db
      .select()
      .from(legislator)
      .where(eq(legislator.isActive, true))
      .orderBy(asc(legislator.seatIndex)),
    profile
      ? db
          .select({
            legislatorId: industryLegislatorWatch.legislatorId,
            reason: industryLegislatorWatch.reason,
            addedAt: industryLegislatorWatch.addedAt,
            legislator: legislator,
          })
          .from(industryLegislatorWatch)
          .innerJoin(
            legislator,
            eq(legislator.id, industryLegislatorWatch.legislatorId),
          )
          .where(eq(industryLegislatorWatch.industryProfileId, profile.id))
      : Promise.resolve([]),
    db
      .select({
        proposerName: bill.proposerName,
        count: sql<number>`count(*)::int`,
      })
      .from(bill)
      .groupBy(bill.proposerName),
  ]);

  const billCountMap = new Map(
    billCountsByProposer.map((r) => [r.proposerName, r.count]),
  );
  const watchedIds = new Set(watchRows.map((w) => w.legislatorId));

  const hemicycleMembers: HemicycleMember[] = allMembers.map((m) => ({
    id: m.id,
    memberId: m.memberId,
    name: m.name,
    party: m.party,
    district: m.district,
    committees: m.committees ?? [],
    highlighted: watchedIds.has(m.id),
  }));

  return (
    <>
      <PageHeader
        title="의원 워치"
        subtitle={`${watchRows.length}명 모니터링 중`}
      />

      <div className="grid grid-cols-[1fr_480px] items-start gap-6 p-6">
        {/* Watched list */}
        <section>
          <div className="mb-3 flex items-center gap-2 border-b-2 border-[var(--color-border)] pb-2 text-[15px] font-bold text-[var(--color-text)]">
            <Users className="h-4 w-4" />
            워치리스트
            <span className="ml-auto text-[12px] font-normal text-[var(--color-text-secondary)]">
              {watchRows.length}명
            </span>
          </div>

          {watchRows.length === 0 ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[13px] text-[var(--color-text-tertiary)]">
              워치리스트가 비어 있습니다.
              <br />
              오른쪽 의석도에서 의원을 클릭해 추가하세요.
            </div>
          ) : (
            <div className="flex flex-col gap-[10px]">
              {watchRows.map((w) => (
                <WatchCard
                  key={w.legislatorId}
                  member={w.legislator}
                  billCount={billCountMap.get(w.legislator.name) ?? 0}
                  reason={w.reason}
                />
              ))}
            </div>
          )}
        </section>

        {/* Hemicycle picker */}
        <aside className="sticky top-[80px] flex flex-col items-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
          <div className="mb-2 text-center">
            <h3 className="text-[13px] font-bold text-[var(--color-text)]">
              의원 선택
            </h3>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
              흰 링이 현재 워치 중인 의원
            </p>
          </div>
          <Hemicycle
            members={hemicycleMembers}
            width={440}
            hideLegend
          />
          <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
            클릭 추가/제거는 setup wizard 완성 후 지원됩니다.
          </p>
        </aside>
      </div>
    </>
  );
}

function WatchCard({
  member,
  billCount,
  reason,
}: {
  member: {
    id: number;
    name: string;
    party: string;
    district: string | null;
    committees: string[] | null;
    termNumber: number | null;
  };
  billCount: number;
  reason: string | null;
}) {
  const initials = member.name.slice(0, 1);
  return (
    <div className="flex gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[15px] font-bold text-[var(--color-primary)]">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-[var(--color-text)]">
            {member.name}
          </span>
          <span className="text-[11px] text-[var(--color-text-secondary)]">
            {member.party}
          </span>
          {member.termNumber && (
            <span className="text-[10px] text-[var(--color-text-tertiary)]">
              {member.termNumber}선
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
          {member.district ?? "비례대표"}
          {member.committees && member.committees.length > 0 && (
            <> · {member.committees.join(", ")}</>
          )}
        </div>
        {reason && (
          <div className="mt-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] italic text-[var(--color-text-secondary)]">
            {reason}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-[var(--color-text-tertiary)]">
        <span className="rounded-[4px] bg-[var(--color-surface-2)] px-2 py-0.5 font-mono">
          발의 {billCount}
        </span>
      </div>
    </div>
  );
}
