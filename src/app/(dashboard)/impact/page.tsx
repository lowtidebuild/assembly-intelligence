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
import { bill } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { Sparkles, TrendingUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ImpactPage(props: {
  searchParams: Promise<{ bill?: string }>;
}) {
  const sp = await props.searchParams;
  const selectedBillId = sp.bill ? parseInt(sp.bill, 10) : null;

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

  return (
    <>
      <PageHeader
        title="법안 영향 분석기"
        subtitle="Gemini Pro 기반 심층 분석"
      />

      <div className="grid grid-cols-[320px_1fr] items-start gap-6 p-6">
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
                        {b.proposerName}
                        {b.proposerParty && ` (${b.proposerParty})`}
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
                {selected.proposerName}
                {selected.proposerParty && ` (${selected.proposerParty})`}
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

            {/* Company impact */}
            <Block
              icon={<TrendingUp className="h-4 w-4" />}
              title="당사 영향 사항"
              sublabel="GR/PA 판단 · 수동 편집 가능"
            >
              {selected.companyImpact ? (
                <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
                  {selected.companyImpact}
                </p>
              ) : (
                <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
                  아직 작성되지 않았습니다.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]"
                  title="API 라우트 구현 예정"
                >
                  <Sparkles className="h-3 w-3" />
                  AI 초안 생성
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]"
                >
                  수동 편집
                </button>
              </div>
            </Block>

            {/* Deep analysis placeholder */}
            <Block
              icon={<Sparkles className="h-4 w-4" />}
              title="심층 분석"
              sublabel="Gemini Pro · 요청 시 생성"
            >
              <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
                아직 분석이 생성되지 않았습니다. Lane D에서 on-demand 버튼을
                연결할 예정입니다.
              </p>
              <button
                type="button"
                disabled
                className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-tertiary)]"
              >
                <Sparkles className="h-3 w-3" />
                심층 분석 생성 (준비 중)
              </button>
            </Block>
          </div>
        )}
      </div>
    </>
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
