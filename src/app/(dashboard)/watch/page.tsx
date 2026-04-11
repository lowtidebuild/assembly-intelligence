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
  industryCommittee,
  legislator,
  industryLegislatorWatch,
  industryProfile,
} from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/page-header";
import { Hemicycle, type HemicycleMember } from "@/components/hemicycle";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import {
  computeImportance,
  type ImportanceLevel,
  type ImportanceRecord,
} from "@/lib/legislator-importance";
import { Plus, Sparkles, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
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
    : new Map<number, ImportanceRecord>();

  const [allMembers, watchRows] = await Promise.all([
    db
      .select({
        id: legislator.id,
        memberId: legislator.memberId,
        name: legislator.name,
        nameHanja: legislator.nameHanja,
        party: legislator.party,
        district: legislator.district,
        electionType: legislator.electionType,
        committees: legislator.committees,
        termNumber: legislator.termNumber,
        committeeRole: legislator.committeeRole,
      })
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
  ]);

  const watchedIds = new Set(watchRows.map((w) => w.legislatorId));
  const recommendations = allMembers
    .filter((member) => {
      const importance = importanceById.get(member.id);
      return (
        !watchedIds.has(member.id) &&
        (importance?.level === "S" || importance?.level === "A")
      );
    })
    .sort((a, b) => compareImportance(importanceById.get(a.id), importanceById.get(b.id)))
    .slice(0, 12);

  const hemicycleMembers: HemicycleMember[] = allMembers.map((m) => ({
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
    highlighted: watchedIds.has(m.id),
  }));

  async function addRecommendedWatch(formData: FormData) {
    "use server";

    if (!profile) return;

    const rawLegislatorId = formData.get("legislatorId");
    const rawReason = formData.get("reason");
    const legislatorId =
      typeof rawLegislatorId === "string" ? Number.parseInt(rawLegislatorId, 10) : NaN;
    const reason = typeof rawReason === "string" && rawReason.trim()
      ? rawReason.trim()
      : "산업 중요도 자동 추천";

    if (!Number.isFinite(legislatorId)) return;

    await db
      .insert(industryLegislatorWatch)
      .values({
        industryProfileId: profile.id,
        legislatorId,
        reason,
        isAutoAdded: false,
      })
      .onConflictDoNothing({
        target: [
          industryLegislatorWatch.industryProfileId,
          industryLegislatorWatch.legislatorId,
        ],
      });

    revalidatePath("/watch");
    revalidatePath("/assembly");
    revalidatePath("/briefing");
    revalidatePath("/radar");
    revalidatePath("/impact");
  }

  return (
    <>
      <PageHeader
        title="의원 워치"
        subtitle={`${watchRows.length}명 모니터링 중`}
      />

      <div className="grid grid-cols-[1fr_480px] items-start gap-6 p-6">
        {/* Watched list */}
        <section>
          {profile && (
            <RecommendationSection
              members={recommendations}
              importanceById={importanceById}
              action={addRecommendedWatch}
            />
          )}

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
                  importance={importanceById.get(w.legislatorId) ?? null}
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
              흰 링은 현재 워치 · 색 링은 산업 중요도
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
  importance,
  reason,
}: {
  member: {
    id: number;
    name: string;
    nameHanja: string | null;
    party: string;
    district: string | null;
    electionType: string | null;
    committees: string[] | null;
    termNumber: number | null;
    committeeRole: string | null;
  };
  importance: ImportanceRecord | null;
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
          {member.nameHanja && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              {member.nameHanja}
            </span>
          )}
          <LegislatorImportanceStar
            level={importance?.level ?? null}
            size={14}
            reasons={importance?.reasons}
          />
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
          {member.electionType && <> · {member.electionType}</>}
          {member.committees && member.committees.length > 0 && (
            <> · {member.committees.join(", ")}</>
          )}
        </div>
        {member.committeeRole &&
          member.committeeRole !== "위원" && (
            <div className="mt-1">
              <CommitteeRoleBadge role={member.committeeRole} />
            </div>
          )}
        {reason && (
          <div className="mt-1.5 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-[11px] italic text-[var(--color-text-secondary)]">
            {reason}
          </div>
        )}
        {importance?.reasons && importance.reasons.length > 0 && (
          <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
            {importance.reasons.join(" · ")}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-[10px] text-[var(--color-text-tertiary)]">
        <span className="rounded-[4px] bg-[var(--color-surface-2)] px-2 py-0.5 font-mono">
          발의 {importance?.sponsoredBillCount ?? 0}
        </span>
      </div>
    </div>
  );
}

function RecommendationSection({
  members,
  importanceById,
  action,
}: {
  members: Array<{
    id: number;
    name: string;
    party: string;
    district: string | null;
    electionType: string | null;
    termNumber: number | null;
    committeeRole: string | null;
  }>;
  importanceById: Map<number, ImportanceRecord>;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="mb-6 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-2 text-[14px] font-bold text-[var(--color-text)]">
        <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
        산업 관련 의원 자동 추천
      </div>
      {members.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-tertiary)]">
          아직 추천할 의원이 없습니다. 현재 워치가 이미 충분하거나 중요도 계산 결과가 비어 있습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const importance = importanceById.get(member.id);
            return (
              <form
                key={member.id}
                action={action}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
              >
                <input type="hidden" name="legislatorId" value={member.id} />
                <input
                  type="hidden"
                  name="reason"
                  value={importance?.reasons.join(" · ") || "산업 중요도 자동 추천"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
                    <span>{member.name}</span>
                    <LegislatorImportanceStar
                      level={importance?.level ?? null}
                      size={14}
                      reasons={importance?.reasons}
                    />
                    <span className="text-[11px] font-normal text-[var(--color-text-secondary)]">
                      {member.party}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
                    {member.district ?? "비례대표"}
                    {member.electionType && <> · {member.electionType}</>}
                    {member.termNumber && <> · {member.termNumber}선</>}
                    {member.committeeRole &&
                      member.committeeRole !== "위원" && (
                        <> · {member.committeeRole}</>
                      )}
                  </div>
                  {importance?.reasons && importance.reasons.length > 0 && (
                    <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                      {importance.reasons.join(" · ")}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3 w-3" />
                  워치리스트에 추가
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}

function compareImportance(
  left: ImportanceRecord | undefined,
  right: ImportanceRecord | undefined,
): number {
  const rank = (level: ImportanceLevel | null | undefined) =>
    level === "S" ? 0 : level === "A" ? 1 : level === "B" ? 2 : 3;
  const byLevel = rank(left?.level) - rank(right?.level);
  if (byLevel !== 0) return byLevel;
  return (right?.sponsoredBillCount ?? 0) - (left?.sponsoredBillCount ?? 0);
}

function CommitteeRoleBadge({ role }: { role: string }) {
  const color =
    role === "위원장"
      ? "bg-[#fef3c7] text-[#b45309]"
      : role === "간사"
        ? "bg-[#dbeafe] text-[#1d4ed8]"
        : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]";
  return (
    <span
      className={`inline-block rounded-[8px] px-[6px] py-[1px] text-[10px] font-semibold ${color}`}
    >
      {role}
    </span>
  );
}
