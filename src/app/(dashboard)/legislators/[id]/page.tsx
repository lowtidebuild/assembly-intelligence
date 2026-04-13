import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  bill,
  industryCommittee,
  industryLegislatorWatch,
  industryProfile,
  legislator,
  vote,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import { LegislatorAvatar } from "@/components/legislator-avatar";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import {
  loadImportanceForLegislator,
  type ImportanceRecord,
} from "@/lib/legislator-importance";
import {
  addLegislatorToWatchAction,
  removeLegislatorFromWatchAction,
} from "@/lib/watch-actions";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoWatchCardControls } from "@/components/demo-watch-controls";
import { ExternalLink, Minus, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LegislatorDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const legislatorId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(legislatorId)) {
    notFound();
  }

  const [member] = await db
    .select()
    .from(legislator)
    .where(eq(legislator.id, legislatorId))
    .limit(1);

  if (!member) {
    notFound();
  }

  const [profile] = await db.select().from(industryProfile).limit(1);
  const industryCommittees = profile
    ? await db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];
  const importance = profile
    ? await loadImportanceForLegislator(member.id, {
        profileId: profile.id,
        committeeCodes: industryCommittees.map((c) => c.committeeCode),
      })
    : null;

  const [watchRow, sponsoredBills, recentVotes] = await Promise.all([
    profile
      ? db
          .select({ legislatorId: industryLegislatorWatch.legislatorId })
          .from(industryLegislatorWatch)
          .where(
            and(
              eq(industryLegislatorWatch.industryProfileId, profile.id),
              eq(industryLegislatorWatch.legislatorId, member.id),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    db
      .select({
        id: bill.id,
        billName: bill.billName,
        proposalDate: bill.proposalDate,
        relevanceScore: bill.relevanceScore,
        stage: bill.stage,
      })
      .from(bill)
      .where(
        and(
          eq(bill.proposerName, member.name),
          sql`(${bill.proposerParty} IS NULL OR ${bill.proposerParty} = ${member.party})`,
          sql`${bill.relevanceScore} >= 3`,
          sql`${bill.proposalDate} > NOW() - INTERVAL '180 days'`,
        ),
      )
      .orderBy(desc(bill.proposalDate)),
    db
      .select({
        voteDate: vote.voteDate,
        result: vote.result,
        billId: bill.id,
        billName: bill.billName,
      })
      .from(vote)
      .innerJoin(bill, eq(vote.billId, bill.id))
      .where(eq(vote.legislatorId, member.id))
      .orderBy(desc(vote.voteDate))
      .limit(8),
  ]);

  const isWatched = watchRow.length > 0;
  const officeSummary = [member.officeAddress, member.officePhone].filter(Boolean).join(" · ");
  const staffSummary = formatStaff(member.staffRaw, member.secretaryRaw);
  const birthSummary = [member.birthDate, member.birthCalendar].filter(Boolean).join(" ");

  return (
    <>
      <PageHeader
        title="의원 프로필"
        subtitle={`${member.name}${profile ? ` · ${profile.name} 산업` : ""}`}
      />

      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 p-6">
        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
          <Link
            href="/legislators"
            className="mb-4 inline-flex text-[12px] font-medium text-[var(--color-primary)] hover:underline"
          >
            ← 목록으로
          </Link>

          <div className="flex flex-wrap items-start gap-3">
            <LegislatorAvatar
              name={member.name}
              photoUrl={member.photoUrl}
              size={80}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[24px] font-bold leading-tight text-[var(--color-text)]">
                  {member.name}
                </h2>
                {member.nameHanja && (
                  <span className="text-[15px] text-[var(--color-text-tertiary)]">
                    ({member.nameHanja})
                  </span>
                )}
                <LegislatorImportanceStar
                  level={importance?.level ?? null}
                  size={16}
                  reasons={importance?.reasons}
                />
                <span className="text-[14px] font-medium text-[var(--color-text-secondary)]">
                  {member.party}
                </span>
              </div>
              <div className="mt-1 text-[13px] text-[var(--color-text-secondary)]">
                {member.district ?? "비례대표"}
                {member.electionType && ` · ${member.electionType}`}
                {member.termNumber && ` · ${member.termNumber}선`}
                {member.committeeRole &&
                  member.committeeRole !== "위원" &&
                  ` · ${member.committeeRole}`}
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr]">
          <InfoCard title="기본 정보">
            <FactsGrid
              rows={[
                ["생년월일", birthSummary || "—"],
                ["성별", member.gender ?? "—"],
                ["이메일", member.email ?? "—"],
                [
                  "홈페이지",
                  member.homepage ? (
                    <a
                      href={member.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                    >
                      열기
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "—"
                  ),
                ],
                ["사무실", officeSummary || "—"],
                ["보좌진", staffSummary || "—"],
              ]}
            />
          </InfoCard>

          <InfoCard title="위원회 활동">
            {member.committees && member.committees.length > 0 ? (
              <ul className="space-y-2 text-[13px] text-[var(--color-text)]">
                {member.committees.map((committee, index) => (
                  <li
                    key={`${committee}-${index}`}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                  >
                    {committee}
                    {index === 0 && member.committeeRole && member.committeeRole !== "위원" && (
                      <span className="ml-2 text-[11px] font-semibold text-[var(--color-primary)]">
                        {member.committeeRole}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>등록된 위원회 정보가 없습니다.</EmptyNote>
            )}
          </InfoCard>
        </div>

        <InfoCard title="주요 약력">
          {member.memTitle ? (
            <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[var(--color-text)]">
              {member.memTitle}
            </pre>
          ) : (
            <EmptyNote>저장된 약력이 없습니다.</EmptyNote>
          )}
        </InfoCard>

        <InfoCard
          title="산업 관련 대표발의 법안 (최근 180일)"
          sublabel={`${sponsoredBills.length}건`}
        >
          {sponsoredBills.length === 0 ? (
            <EmptyNote>최근 180일 내 산업 관련 대표발의 법안이 없습니다.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {sponsoredBills.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/radar?bill=${entry.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 transition-colors hover:bg-[var(--color-surface)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--color-text)]">
                      {entry.billName}
                    </div>
                    {entry.proposalDate && (
                      <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {entry.proposalDate.toISOString().slice(0, 10)}
                      </div>
                    )}
                  </div>
                  {entry.relevanceScore !== null && (
                    <RelevanceScoreBadge score={entry.relevanceScore} />
                  )}
                </Link>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard
          title="최근 표결 이력"
          sublabel={`${recentVotes.length}건`}
        >
          {recentVotes.length === 0 ? (
            <EmptyNote>아직 저장된 표결 이력이 없습니다.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {recentVotes.map((entry) => (
                <Link
                  key={`${entry.billId}-${entry.voteDate.toISOString()}`}
                  href={`/impact?bill=${entry.billId}`}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 transition-colors hover:bg-[var(--color-surface)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--color-text)]">
                      {entry.billName}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                      {entry.voteDate.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <VoteResultPill result={entry.result} />
                </Link>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard title="산업 중요도 분석">
          {importance?.level ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px] text-[var(--color-text)]">
                <span className="font-semibold">등급: {importance.level}</span>
                <LegislatorImportanceStar
                  level={importance.level}
                  size={14}
                  reasons={importance.reasons}
                />
              </div>
              {importance.reasons.length > 0 && (
                <div className="text-[12px] text-[var(--color-text-secondary)]">
                  이유: {importance.reasons.join(" · ")}
                </div>
              )}
            </div>
          ) : (
            <EmptyNote>현재 프로필 기준 중요도 정보가 없습니다.</EmptyNote>
          )}
        </InfoCard>

        {profile && (
          <InfoCard title="워치리스트">
            {isDemoMode() ? (
              <DemoWatchCardControls
                legislatorId={member.id}
                defaultReason={buildDefaultReason(importance, member.name)}
                initialEntries={
                  isWatched
                    ? [
                        {
                          legislatorId: member.id,
                          reason: buildDefaultReason(importance, member.name),
                          addedAt: new Date().toISOString(),
                        },
                      ]
                    : []
                }
              />
            ) : isWatched ? (
              <form action={removeLegislatorFromWatchAction}>
                <input type="hidden" name="legislatorId" value={member.id} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                >
                  <Minus className="h-3 w-3" />
                  워치리스트에서 제거
                </button>
              </form>
            ) : (
              <form action={addLegislatorToWatchAction}>
                <input type="hidden" name="legislatorId" value={member.id} />
                <input
                  type="hidden"
                  name="reason"
                  value={buildDefaultReason(importance, member.name)}
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3 w-3" />
                  워치리스트에 추가
                </button>
              </form>
            )}
          </InfoCard>
        )}
      </div>
    </>
  );
}

function VoteResultPill({
  result,
}: {
  result: "yes" | "no" | "abstain" | "absent" | "unknown";
}) {
  const label =
    result === "yes"
      ? "찬성"
      : result === "no"
        ? "반대"
        : result === "abstain"
          ? "기권"
          : result === "absent"
            ? "불참"
            : "기타";
  const className =
    result === "yes"
      ? "bg-[#dcfce7] text-[#166534]"
      : result === "no"
        ? "bg-[#fee2e2] text-[#b91c1c]"
        : result === "abstain"
          ? "bg-[#fef3c7] text-[#b45309]"
          : "bg-[var(--color-surface)] text-[var(--color-text-secondary)]";

  return (
    <span
      className={`inline-flex rounded-[10px] px-[7px] py-[2px] text-[10px] font-bold ${className}`}
    >
      {label}
    </span>
  );
}

function InfoCard({
  title,
  sublabel,
  children,
}: {
  title: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        <h3 className="text-[13px] font-bold text-[var(--color-text)]">{title}</h3>
        {sublabel && (
          <span className="text-[10px] text-[var(--color-text-tertiary)]">
            · {sublabel}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function FactsGrid({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-[12px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
          <dd className="text-[var(--color-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}

function formatStaff(
  staffRaw: string | null,
  secretaryRaw: string | null,
): string {
  const parts = [];
  if (staffRaw) parts.push(`보좌진: ${staffRaw}`);
  if (secretaryRaw) parts.push(`비서관: ${secretaryRaw}`);
  return parts.join(" · ");
}

function buildDefaultReason(
  importance: ImportanceRecord | null | undefined,
  name: string,
) {
  if (importance?.reasons && importance.reasons.length > 0) {
    return importance.reasons.join(" · ");
  }
  return `${name} 수동 추가`;
}
