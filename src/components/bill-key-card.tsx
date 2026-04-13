/**
 * BillKeyCard — the "오늘의 핵심" card in the briefing page.
 *
 * Matches ParlaWatch variant-C .key-card:
 *   [num] [body: title + meta] [score badge]
 *
 * Server component. Accepts a Bill row directly from Drizzle.
 */

import type { Bill } from "@/db/schema";
import Link from "next/link";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import {
  LegislatorImportanceStar,
} from "@/components/legislator-importance-star";
import type { ImportanceRecord } from "@/lib/legislator-importance";

function formatIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date =
    value instanceof Date ? value : new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10).replaceAll("-", ".");
}

function excerptProposalReason(
  value: string | null | undefined,
  maxLength = 200,
): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

export function BillKeyCard({
  number,
  bill,
  proposerImportance,
  proposerHref,
}: {
  number: string;
  bill: Pick<
    Bill,
    | "id"
    | "billName"
    | "proposerName"
    | "proposerParty"
    | "committee"
    | "stage"
    | "relevanceScore"
    | "proposalDate"
    | "proposalReason"
    | "summaryText"
  >;
  proposerImportance?: ImportanceRecord | null;
  proposerHref?: string | null;
}) {
  const proposalDate = formatIsoDate(bill.proposalDate);
  const proposalExcerpt = excerptProposalReason(bill.proposalReason);

  return (
    <div className="grid grid-cols-[24px_1fr_auto] gap-3 rounded-[var(--radius)] border border-l-4 border-[var(--color-border)] border-l-[var(--color-domain)] bg-[var(--color-surface)] p-[13px_15px] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="pt-[2px] text-[13px] font-extrabold text-[var(--color-primary)]">
        {number}
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[14px] font-semibold leading-snug text-[var(--color-text)]">
          {bill.billName}
        </div>
        {proposalExcerpt ? (
          <p className="mb-1.5 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            {proposalExcerpt}
          </p>
        ) : bill.summaryText ? (
          <p className="mb-1.5 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            {bill.summaryText}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[3px] text-[11px] text-[var(--color-text-secondary)]">
          <StageBadge stage={bill.stage} />
          {bill.committee && <span>{bill.committee}</span>}
          <span>·</span>
          {proposerHref ? (
            <Link
              href={proposerHref}
              scroll={false}
              className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
            >
              {bill.proposerName}
              <LegislatorImportanceStar
                level={proposerImportance?.level ?? null}
                size={12}
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
                size={12}
                reasons={proposerImportance?.reasons}
              />
              {bill.proposerParty && (
                <span className="ml-1 text-[var(--color-text-tertiary)]">
                  ({bill.proposerParty})
                </span>
              )}
            </span>
          )}
          {proposalDate && (
            <>
              <span>·</span>
              <span>{proposalDate}</span>
            </>
          )}
        </div>
      </div>
      {bill.relevanceScore !== null && (
        <RelevanceScoreBadge score={bill.relevanceScore} />
      )}
    </div>
  );
}
