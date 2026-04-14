import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  bill,
  industryCommittee,
  industryLegislatorWatch,
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
import { flattenErrorText, loadActiveIndustryProfileCompat } from "@/lib/db-compat";
import { buildTranscriptSnippet } from "@/lib/transcript-parser";
import { summarizeLegislatorIssueSignals } from "@/lib/stance-analysis";
import { cn } from "@/lib/utils";
import { loadTranscriptHitsForLegislator } from "@/services/transcript-sync";
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

  const profile = await loadActiveIndustryProfileCompat();
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

  const [watchRow, sponsoredBills, recentVotes, transcriptHits] = await Promise.all([
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
    loadTranscriptHitsForLegislator(member.name, 5).catch((err) => {
      if (!isMissingTranscriptSchemaError(err)) {
        throw err;
      }
      return [];
    }),
  ]);

  const isWatched = watchRow.length > 0;
  const officeSummary = [member.officeAddress, member.officePhone].filter(Boolean).join(" · ");
  const staffSummary = formatStaff(member.staffRaw, member.secretaryRaw);
  const birthSummary = [member.birthDate, member.birthCalendar].filter(Boolean).join(" ");
  const issueSummary = summarizeLegislatorIssueSignals({
    transcriptHits,
    recentVotes,
  });

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

        <InfoCard
          title="산업 키워드 관련 회의록 발언"
          sublabel={`${transcriptHits.length}건`}
        >
          {transcriptHits.length === 0 ? (
            <EmptyNote>최근 저장된 관련 회의록 발언이 없습니다.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {transcriptHits.map((entry) => (
                <Link
                  key={`${entry.minutesId}-${entry.utteranceId}`}
                  href={`/transcripts/${entry.minutesId}#utterance-${entry.utteranceId}`}
                  className="block rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 transition-colors hover:bg-[var(--color-surface)]"
                >
                  <div className="text-[12px] font-medium leading-snug text-[var(--color-text)]">
                    {entry.meetingName}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                    <span className="font-semibold text-[var(--color-primary)]">
                      {entry.committee ?? "위원회 미상"}
                    </span>
                    {entry.meetingDate && <span>{entry.meetingDate}</span>}
                    {entry.sessionLabel && <span>· {entry.sessionLabel}</span>}
                    {entry.place && <span>· {entry.place}</span>}
                    {entry.speakerRole && <span>· {entry.speakerRole}</span>}
                  </div>
                  {entry.matchedKeywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {entry.matchedKeywords.map((keyword) => (
                        <span
                          key={`${entry.minutesId}-${keyword}`}
                          className="rounded-[999px] bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                  {(entry.content || entry.snippet) && (
                    <p className="mt-2 line-clamp-5 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                      {buildTranscriptSnippet(entry.content ?? "", entry.matchedKeywords, 220) ??
                        entry.snippet}
                    </p>
                  )}
                  <div className="mt-2 text-[11px] font-medium text-[var(--color-primary)]">
                    해당 원문 발언 보기
                  </div>
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

        <InfoCard title="최근 회의록·표결 기반 스탠스 신호">
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <IssueStancePill stance={issueSummary.stance} />
              <span className="text-[12px] text-[var(--color-text-secondary)]">
                confidence {issueSummary.confidence}%
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
              <IssueStat label="회의록 hit" value={issueSummary.transcriptHitCount} />
              <IssueStat label="긍정 발언" value={issueSummary.supportiveMentions} />
              <IssueStat label="우려 발언" value={issueSummary.concernMentions} />
              <IssueStat label="혼합 발언" value={issueSummary.mixedMentions} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SignalBucket
                title="긍정 신호"
                items={issueSummary.supportingSignals}
                tone="support"
                emptyLabel="아직 뚜렷한 긍정 신호가 없습니다."
              />
              <SignalBucket
                title="리스크 신호"
                items={issueSummary.riskSignals}
                tone="risk"
                emptyLabel="아직 뚜렷한 리스크 신호가 없습니다."
              />
            </div>
          </div>
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
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-text)]"
      : result === "no"
        ? "bg-[var(--color-error-soft)] text-[var(--color-error-text)]"
        : result === "abstain"
          ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]"
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

function IssueStancePill({
  stance,
}: {
  stance: "support" | "concern" | "mixed" | "unclear";
}) {
  const config =
    stance === "support"
      ? {
          label: "긍정 경향",
          className:
            "bg-[var(--color-success-soft)] text-[var(--color-success-text)]",
        }
      : stance === "concern"
        ? {
            label: "우려 경향",
            className:
              "bg-[var(--color-error-soft)] text-[var(--color-error-text)]",
          }
        : stance === "mixed"
          ? {
              label: "혼합",
              className:
                "bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]",
            }
          : { label: "불명", className: "bg-[var(--color-surface)] text-[var(--color-text-secondary)]" };

  return (
    <span className={`inline-flex rounded-[10px] px-[8px] py-[3px] text-[11px] font-bold ${config.className}`}>
      {config.label}
    </span>
  );
}

function IssueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-bold text-[var(--color-text)]">{value}</div>
    </div>
  );
}

function SignalBucket({
  title,
  items,
  tone,
  emptyLabel,
}: {
  title: string;
  items: string[];
  tone: "support" | "risk";
  emptyLabel: string;
}) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3">
      <div
        className={cn(
          "mb-2 text-[11px] font-bold uppercase tracking-wide",
          tone === "support"
            ? "text-[var(--color-success-text)]"
            : "text-[var(--color-error-text)]",
        )}
      >
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-[var(--color-text-tertiary)]">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="text-[12px] leading-relaxed text-[var(--color-text)]">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function isMissingTranscriptSchemaError(err: unknown) {
  const message = flattenErrorText(err);
  return (
    (message.includes("committee_transcript") ||
      message.includes("committee_transcript_utterance")) &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("42P01") ||
      message.includes("Failed query") ||
      message.includes("does not exist"))
  );
}
