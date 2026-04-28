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
import { BillDetailContent } from "@/components/bill-detail-content";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import type { ImportanceRecord } from "@/lib/legislator-importance";
import { X } from "lucide-react";

export function BillSlideOver({
  bill,
  closeHref,
  proposerImportance,
  proposerHref,
}: {
  bill: Bill;
  closeHref: string;
  proposerImportance?: ImportanceRecord | null;
  proposerHref?: string | null;
}) {
  return (
    <>
      {/* Backdrop — click to close */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label="닫기"
        className="fixed inset-0 z-20 animate-[fadeIn_200ms_ease-out_both] bg-black/20 backdrop-blur-[1px]"
      />
      {/* Panel */}
      <aside className="fixed right-0 top-0 z-30 h-screen w-full animate-[slideInRight_250ms_cubic-bezier(0.16,1,0.3,1)_both] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)] md:w-[500px]">
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
              {proposerHref ? (
                <Link
                  href={proposerHref}
                  scroll={false}
                  className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                >
                  {bill.proposerName}
                  <LegislatorImportanceStar
                    level={proposerImportance?.level ?? null}
                    size={14}
                    reasons={proposerImportance?.reasons}
                  />
                  {bill.proposerParty && (
                    <span className="ml-1 text-[var(--color-text-tertiary)]">
                      ({bill.proposerParty})
                    </span>
                  )}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {bill.proposerName}
                  <LegislatorImportanceStar
                    level={proposerImportance?.level ?? null}
                    size={14}
                    reasons={proposerImportance?.reasons}
                  />
                  {bill.proposerParty && (
                    <span className="ml-1 text-[var(--color-text-tertiary)]">
                      ({bill.proposerParty})
                    </span>
                  )}
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

        <div className="px-5 py-5">
          <BillDetailContent bill={bill} variant="panel" />
        </div>
      </aside>
    </>
  );
}
