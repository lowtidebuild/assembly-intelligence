import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bill as billTable,
  billTimeline,
  industryCommittee,
} from "@/db/schema";
import { BillDetailContent } from "@/components/bill-detail-content";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import {
  loadCachedImportance,
  loadProposerImportanceMap,
  makeProposerKey,
} from "@/lib/legislator-importance";
import { isDemoMode } from "@/lib/demo-mode";
import { getDemoBills } from "@/lib/demo-content";
import { loadActiveIndustryProfileCompat } from "@/lib/db-compat";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BillDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const billId = Number.parseInt(params.id, 10);
  if (!Number.isFinite(billId) || billId <= 0) {
    notFound();
  }

  const demoMode = isDemoMode();
  const [row] = demoMode
    ? [getDemoBills().find((entry) => entry.id === billId) ?? null]
    : await db
        .select()
        .from(billTable)
        .where(eq(billTable.id, billId))
        .limit(1);

  if (!row) {
    notFound();
  }

  const profile = await loadActiveIndustryProfileCompat();
  const industryCommittees = profile
    ? await db
        .select({ committeeCode: industryCommittee.committeeCode })
        .from(industryCommittee)
        .where(eq(industryCommittee.industryProfileId, profile.id))
    : [];
  const importanceById = profile
    ? await loadCachedImportance({
        profileId: profile.id,
        committeeCodes: industryCommittees.map((c) => c.committeeCode),
      })
    : new Map();
  const proposerImportance = await loadProposerImportanceMap(
    [{ name: row.proposerName, party: row.proposerParty }],
    importanceById,
  );
  const proposerEntry = proposerImportance.get(
    makeProposerKey(row.proposerName, row.proposerParty),
  );
  const timeline = demoMode
    ? []
    : await db
        .select({
          stage: billTimeline.stage,
          eventDate: billTimeline.eventDate,
          description: billTimeline.description,
        })
        .from(billTimeline)
        .where(eq(billTimeline.billId, row.id))
        .orderBy(desc(billTimeline.eventDate));
  const proposalDate = formatIsoDate(row.proposalDate);

  return (
    <>
      <PageHeader
        title="법안 상세"
        subtitle={row.committee ?? "입법 레이더"}
      />

      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 p-6">
        <Link
          href="/radar"
          className="inline-flex w-fit items-center gap-1.5 text-[12px] font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          입법 레이더
        </Link>

        <section className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StageBadge stage={row.stage} />
            {row.relevanceScore !== null && (
              <RelevanceScoreBadge score={row.relevanceScore} />
            )}
          </div>

          <h2 className="max-w-[900px] text-[22px] font-bold leading-tight text-[var(--color-text)]">
            {row.billName}
          </h2>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--color-text-secondary)]">
            {proposerEntry ? (
              <Link
                href={`/legislators/${proposerEntry.legislatorId}`}
                className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
              >
                {row.proposerName}
                <LegislatorImportanceStar
                  level={proposerEntry.importance.level}
                  size={14}
                  reasons={proposerEntry.importance.reasons}
                />
                {row.proposerParty && (
                  <span className="text-[var(--color-text-tertiary)]">
                    ({row.proposerParty})
                  </span>
                )}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1">
                {row.proposerName}
                {row.proposerParty && (
                  <span className="text-[var(--color-text-tertiary)]">
                    ({row.proposerParty})
                  </span>
                )}
              </span>
            )}
            {row.coSponsorCount > 0 && (
              <span>공동발의 {row.coSponsorCount}인</span>
            )}
            {proposalDate && <span>발의일 {proposalDate}</span>}
            {row.billNumber && <span>의안번호 {row.billNumber}</span>}
          </div>
        </section>

        <BillDetailContent bill={row} timeline={timeline} variant="page" />
      </main>
    </>
  );
}

function formatIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
