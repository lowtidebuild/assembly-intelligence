/**
 * BillSlideOver — 500px fixed-right panel showing full bill detail.
 *
 * Opened by ?bill=<id> in the URL. Close button is a Link that
 * drops the `bill` param, which keeps the browser back button honest.
 *
 * This is a SERVER component — it receives a full Bill row and
 * renders static HTML. The overlay click-to-close uses a <Link> so
 * no client JS needed for dismissal.
 *
 * The "AI 영향 분석 생성" button is a form that POSTs to
 * /api/bills/[id]/generate-impact (to be built in the API routes
 * lane). For now it's a disabled placeholder.
 */

import type { Bill } from "@/db/schema";
import Link from "next/link";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { CompanyImpactEditor } from "@/components/company-impact-editor";
import { X, ExternalLink } from "lucide-react";

export function BillSlideOver({
  bill,
  closeHref,
}: {
  bill: Bill;
  closeHref: string;
}) {
  return (
    <>
      {/* Backdrop — click to close */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label="닫기"
        className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px]"
      />
      {/* Panel */}
      <aside className="fixed right-0 top-0 z-30 h-screen w-[500px] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[-4px_0_20px_rgba(0,0,0,0.08)]">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex-1 pr-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StageBadge stage={bill.stage} />
              {bill.relevanceScore !== null && (
                <RelevanceScoreBadge score={bill.relevanceScore} />
              )}
            </div>
            <h2 className="text-[15px] font-bold leading-snug text-[var(--color-text)]">
              {bill.billName}
            </h2>
            <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              {bill.proposerName}
              {bill.proposerParty && (
                <span className="ml-1 text-[var(--color-text-tertiary)]">
                  ({bill.proposerParty})
                </span>
              )}
              {bill.coSponsorCount > 0 && (
                <> · 공동발의 {bill.coSponsorCount}인</>
              )}
              {bill.proposalDate && (
                <>
                  {" · "}
                  {bill.proposalDate.toISOString().slice(0, 10)}
                </>
              )}
            </div>
          </div>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </Link>
        </header>

        <div className="space-y-5 px-5 py-5">
          {/* Quick facts */}
          <Facts bill={bill} />

          {/* Gemini summary (pre-generated during morning sync) */}
          <Block label="AI 요약" sublabel="Gemini Flash">
            {bill.summaryText ? (
              <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
                {bill.summaryText}
              </p>
            ) : (
              <EmptyNote>아직 요약이 생성되지 않았습니다.</EmptyNote>
            )}
          </Block>

          {/* Gemini relevance reasoning */}
          <Block label="중요도 판단" sublabel="Gemini 분석">
            {bill.relevanceReasoning ? (
              <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
                {bill.relevanceReasoning}
              </p>
            ) : (
              <EmptyNote>판단 정보 없음</EmptyNote>
            )}
          </Block>

          {/* Company impact — editable field per design.md section 13 */}
          <Block label="당사 영향 사항" sublabel="GR/PA 판단">
            <CompanyImpactEditor
              billId={bill.id}
              initialImpact={bill.companyImpact}
              initialIsAiDraft={bill.companyImpactIsAiDraft}
              compact
            />
          </Block>

          {/* External link */}
          {bill.externalLink && (
            <a
              href={bill.externalLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              의안정보시스템에서 보기
            </a>
          )}
        </div>
      </aside>
    </>
  );
}

function Facts({ bill }: { bill: Bill }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["의안번호", bill.billId],
    ["소관위원회", bill.committee ?? "—"],
    ["현재 단계", <StageBadge key="s" stage={bill.stage} />],
    [
      "처리상태",
      bill.status ?? (
        <span className="text-[var(--color-text-tertiary)]">계류중</span>
      ),
    ],
  ];
  return (
    <dl className="grid grid-cols-[100px_1fr] gap-y-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[12px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
          <dd className="text-[var(--color-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 border-b border-[var(--color-border)] pb-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text)]">
          {label}
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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}
