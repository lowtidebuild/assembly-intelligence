/**
 * /impact — 법안 영향 분석기.
 *
 * Picks a bill from the URL (?bill=<id>) and shows:
 *   - The same facts as radar's slide-over
 *   - "심층 분석 생성" button → on-demand Gemini Pro call that
 *     returns the 5-section JSON from prompts/bill-analysis.ts
 *   - "당사 영향 초안 생성" button → Gemini Pro to fill
 *     bill.companyImpact if empty
 *
 * The actual API routes for these buttons land in a later lane.
 * This page currently renders the shell + picker.
 */

import { db } from "@/db";
import { bill, industryCommittee, industryProfile, legislator, vote } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { CompanyImpactEditor } from "@/components/company-impact-editor";
import { DeepAnalysisPanel } from "@/components/deep-analysis-panel";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import { LegislatorProfileSlideOver } from "@/components/legislator-profile-slide-over";
import { Sparkles, TrendingUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadCachedImportance,
  loadProposerImportanceMap,
  makeProposerKey,
} from "@/lib/legislator-importance";
import {
  loadBillReferenceSections,
  type BillReferenceItem,
} from "@/lib/mcp-references";

export const dynamic = "force-dynamic";

export default async function ImpactPage(props: {
  searchParams: Promise<{ bill?: string; legislator?: string }>;
}) {
  const sp = await props.searchParams;
  const selectedBillId = sp.bill ? parseInt(sp.bill, 10) : null;
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

  const [recentBills, selected] = await Promise.all([
    db
      .select()
      .from(bill)
      .orderBy(desc(bill.relevanceScore), desc(bill.proposalDate))
      .limit(30),
    selectedBillId
      ? db
          .select()
          .from(bill)
          .where(eq(bill.id, selectedBillId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const voteRows = selected
    ? await db
        .select({
          result: vote.result,
          voteDate: vote.voteDate,
          legislatorName: legislator.name,
          party: legislator.party,
        })
        .from(vote)
        .innerJoin(legislator, eq(vote.legislatorId, legislator.id))
        .where(eq(vote.billId, selected.id))
        .orderBy(desc(vote.voteDate), legislator.name)
    : [];
  const references = selected
    ? await loadBillReferenceSections(selected.billName)
    : null;
  const proposerImportance = await loadProposerImportanceMap(
    [...recentBills, ...(selected ? [selected] : [])].map((entry) => ({
      name: entry.proposerName,
      party: entry.proposerParty,
    })),
    importanceById,
  );
  const selectedProposerEntry = selected
    ? proposerImportance.get(
        makeProposerKey(selected.proposerName, selected.proposerParty),
      )
    : null;
  const voteSummary = summarizeVotes(voteRows);
  const referenceGroups = references
    ? [
        { label: "연구자료", items: references.research, source: "MCP research_data" },
        { label: "NABO", items: references.nabo, source: "get_nabo" },
        { label: "참여입법", items: references.lawmaking, source: "assembly_org(type=lawmaking)" },
      ].filter((group) => group.items.length > 0)
    : [];

  return (
    <>
      <PageHeader
        title="법안 영향 분석기"
        subtitle="Gemini Pro 기반 심층 분석"
      />

      <div className="grid grid-cols-1 items-start gap-6 p-6 lg:grid-cols-[320px_1fr]">
        {/* Bill picker */}
        <aside className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            분석 대상 선택
          </h3>
          <div className="flex flex-col gap-1 text-[12px]">
            {recentBills.map((b) => {
              const active = b.id === selectedBillId;
              return (
                <Link
                  key={b.id}
                  href={`/impact?bill=${b.id}`}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-3 py-2 transition-colors",
                    active
                      ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
                      : "hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{b.billName}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">
                        <span className="inline-flex items-center gap-1">
                          {b.proposerName}
                          <LegislatorImportanceStar
                            level={
                              proposerImportance.get(
                                makeProposerKey(b.proposerName, b.proposerParty),
                              )?.importance.level ?? null
                            }
                            size={12}
                            reasons={
                              proposerImportance.get(
                                makeProposerKey(b.proposerName, b.proposerParty),
                              )?.importance.reasons
                            }
                          />
                          {b.proposerParty && ` (${b.proposerParty})`}
                        </span>
                      </div>
                    </div>
                    {b.relevanceScore !== null && (
                      <RelevanceScoreBadge
                        score={b.relevanceScore}
                        showNumber={false}
                      />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Analysis shell */}
        {!selected ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-center">
            <TrendingUp className="mb-3 h-10 w-10 text-[var(--color-text-tertiary)]" />
            <p className="text-[14px] font-semibold text-[var(--color-text)]">
              왼쪽에서 법안을 선택하세요
            </p>
            <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
              선택한 법안에 대한 심층 분석과 당사 영향 초안을 생성할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
            {/* Bill header */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StageBadge stage={selected.stage} />
                {selected.relevanceScore !== null && (
                  <RelevanceScoreBadge score={selected.relevanceScore} />
                )}
              </div>
              <h2 className="text-[18px] font-bold leading-snug text-[var(--color-text)]">
                {selected.billName}
              </h2>
              <div className="mt-1 text-[12px] text-[var(--color-text-secondary)]">
                {selectedProposerEntry ? (
                  <Link
                    href={`/impact?bill=${selected.id}&legislator=${selectedProposerEntry.legislatorId}`}
                    scroll={false}
                    className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                  >
                    {selected.proposerName}
                    <LegislatorImportanceStar
                      level={selectedProposerEntry.importance.level}
                      size={14}
                      reasons={selectedProposerEntry.importance.reasons}
                    />
                    {selected.proposerParty && ` (${selected.proposerParty})`}
                  </Link>
                ) : (
                  <>
                    {selected.proposerName}
                    {selected.proposerParty && ` (${selected.proposerParty})`}
                  </>
                )}
                {selected.coSponsorCount > 0 &&
                  ` · 공동발의 ${selected.coSponsorCount}인`}
                {selected.committee && ` · ${selected.committee}`}
              </div>
            </div>

            {/* AI summary */}
            {selected.summaryText && (
              <Block
                icon={<FileText className="h-4 w-4" />}
                title="요약"
                sublabel="Gemini Flash · 아침 동기화 시 생성"
              >
                <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
                  {selected.summaryText}
                </p>
              </Block>
            )}

            {/* Relevance reasoning */}
            {selected.relevanceReasoning && (
              <Block
                icon={<Sparkles className="h-4 w-4" />}
                title="중요도 판단"
                sublabel="Gemini Flash"
              >
                <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                  {selected.relevanceReasoning}
                </p>
              </Block>
            )}

            {voteSummary && (
              <Block
                icon={<TrendingUp className="h-4 w-4" />}
                title="표결 현황"
                sublabel="assembly_session(type=vote)"
              >
                <div className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
                  {voteSummary.counts.map((entry) => (
                    <div
                      key={entry.label}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
                        {entry.label}
                      </div>
                      <div className="mt-1 text-[18px] font-bold text-[var(--color-text)]">
                        {entry.value}
                      </div>
                    </div>
                  ))}
                </div>
                {voteSummary.voteDate && (
                  <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">
                    표결일: {voteSummary.voteDate}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {voteSummary.buckets.map((bucket) => (
                    <div
                      key={bucket.label}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3"
                    >
                      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                        {bucket.label}
                      </div>
                      {bucket.names.length > 0 ? (
                        <p className="text-[12px] leading-relaxed text-[var(--color-text)]">
                          {bucket.names.join(", ")}
                        </p>
                      ) : (
                        <p className="text-[12px] text-[var(--color-text-tertiary)]">
                          해당 없음
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Block>
            )}

            {/* Company impact */}
            <Block
              icon={<TrendingUp className="h-4 w-4" />}
              title="당사 영향 사항"
              sublabel="GR/PA 판단 · Gemini Pro 초안 + 수동 편집"
            >
              <CompanyImpactEditor
                billId={selected.id}
                initialImpact={selected.companyImpact}
                initialIsAiDraft={selected.companyImpactIsAiDraft}
              />
            </Block>

            {/* Deep analysis */}
            <Block
              icon={<Sparkles className="h-4 w-4" />}
              title="심층 분석"
              sublabel="Gemini Pro · 5-section 구조"
            >
              <DeepAnalysisPanel
                billId={selected.id}
                initialAnalysis={selected.deepAnalysis}
                initialGeneratedAt={selected.deepAnalysisGeneratedAt}
              />
            </Block>

            {referenceGroups.length > 0 && (
              <Block
                icon={<FileText className="h-4 w-4" />}
                title="참고 자료"
                sublabel={references ? `키워드: ${references.keyword}` : undefined}
              >
                <div className="space-y-3">
                  {referenceGroups.map((group) => (
                    <div
                      key={group.label}
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text)]">
                          {group.label}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-tertiary)]">
                          · {group.source}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {group.items.map((item, index) => (
                          <ReferenceRow key={`${group.label}-${index}`} item={item} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Block>
            )}
          </div>
        )}
      </div>

      {selectedLegislatorId && (
        <LegislatorProfileSlideOver
          legislatorId={selectedLegislatorId}
          closeHref={selected ? `/impact?bill=${selected.id}` : "/impact"}
          importance={importanceById.get(selectedLegislatorId) ?? null}
        />
      )}
    </>
  );
}

type VoteRow = {
  result: "yes" | "no" | "abstain" | "absent" | "unknown";
  voteDate: Date;
  legislatorName: string;
  party: string;
};

function summarizeVotes(rows: VoteRow[]) {
  if (rows.length === 0) return null;

  const counts = {
    yes: 0,
    no: 0,
    abstain: 0,
    absent: 0,
    unknown: 0,
  };
  const buckets = {
    yes: [] as string[],
    no: [] as string[],
    abstain: [] as string[],
    absent: [] as string[],
  };

  for (const row of rows) {
    counts[row.result] += 1;
    if (
      row.result !== "unknown" &&
      buckets[row.result].length < 8
    ) {
      buckets[row.result].push(
        row.party ? `${row.legislatorName} (${row.party})` : row.legislatorName,
      );
    }
  }

  return {
    voteDate: rows[0]?.voteDate?.toISOString().slice(0, 10) ?? null,
    counts: [
      { label: "찬성", value: counts.yes },
      { label: "반대", value: counts.no },
      { label: "기권", value: counts.abstain },
      { label: "불참/기타", value: counts.absent + counts.unknown },
    ],
    buckets: [
      { label: "찬성", names: buckets.yes },
      { label: "반대", names: buckets.no },
      { label: "기권", names: buckets.abstain },
      { label: "불참", names: buckets.absent },
    ],
  };
}

function ReferenceRow({ item }: { item: BillReferenceItem }) {
  const content = (
    <>
      <div className="text-[12px] font-medium leading-snug text-[var(--color-text)]">
        {item.title}
      </div>
      {item.subtitle && (
        <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
          {item.subtitle}
        </div>
      )}
    </>
  );

  return (
    <li>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2 transition-colors hover:bg-[var(--color-bg)]"
        >
          {content}
        </a>
      ) : (
        <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2">
          {content}
        </div>
      )}
    </li>
  );
}

function Block({
  icon,
  title,
  sublabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        {icon}
        <h3 className="text-[13px] font-bold text-[var(--color-text)]">
          {title}
        </h3>
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
