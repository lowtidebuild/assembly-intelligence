/**
 * /radar — 입법 레이더.
 *
 * The Excel replacement. Dense table of all bills with filters
 * and sort. Bill rows link to the canonical /bills/[id] detail page.
 *
 * Filtering is URL-driven so filters are shareable and the server
 * does all the work. Table uses a plain <table> — we'll add
 * TanStack Table later if users need column drag/reorder.
 *
 * Query params:
 *   - q       : search over bill_name + proposer_name
 *   - stage   : stage_1..stage_6
 *   - min     : minimum relevance score
 *   - cte     : committee exact match
 *   - sort    : date | score | name (prefix "-" for desc)
 *
 * Legacy ?bill=<id> URLs redirect to /bills/[id] so old alerts and
 * exported links keep working.
 */

import { db } from "@/db";
import {
  bill,
  industryCommittee,
  type Bill,
} from "@/db/schema";
import { and, desc, asc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { StageBadge } from "@/components/stage-badge";
import { RelevanceScoreBadge } from "@/components/relevance-score-badge";
import { LegislatorImportanceStar } from "@/components/legislator-importance-star";
import { LegislatorProfileSlideOver } from "@/components/legislator-profile-slide-over";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils";
import { billHref } from "@/lib/routes";
import {
  loadCachedImportance,
  loadProposerImportanceMap,
  makeProposerKey,
  type ImportanceRecord,
} from "@/lib/legislator-importance";
import { getDemoBills } from "@/lib/demo-content";
import { isDemoMode } from "@/lib/demo-mode";
import { loadActiveIndustryProfileCompat } from "@/lib/db-compat";

export const dynamic = "force-dynamic";

interface SearchParams {
  q?: string;
  stage?: string;
  min?: string;
  cte?: string;
  sort?: string;
  bill?: string;
  legislator?: string;
}

export default async function RadarPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const demoMode = isDemoMode();
  const sp = await props.searchParams;
  const q = sp.q?.trim() || "";
  const stageFilter = sp.stage || "";
  const minScore = sp.min ? parseInt(sp.min, 10) : 0;
  const cteFilter = sp.cte || "";
  const sort = sp.sort || "-date";
  const selectedBillId = sp.bill ? parseInt(sp.bill, 10) : null;
  if (selectedBillId && Number.isFinite(selectedBillId)) {
    redirect(billHref(selectedBillId));
  }
  const selectedLegislatorId = sp.legislator
    ? Number.parseInt(sp.legislator, 10)
    : null;

  // Build WHERE clauses
  const conditions = [];
  if (q) {
    conditions.push(
      or(ilike(bill.billName, `%${q}%`), ilike(bill.proposerName, `%${q}%`)),
    );
  }
  if (stageFilter) {
    conditions.push(eq(bill.stage, stageFilter as Bill["stage"]));
  }
  if (minScore > 0) {
    conditions.push(gte(bill.relevanceScore, minScore));
  }
  if (cteFilter) {
    conditions.push(eq(bill.committee, cteFilter));
  }
  const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

  // Sort
  const sortMap: Record<string, ReturnType<typeof desc>> = {
    "-date": desc(bill.proposalDate),
    date: asc(bill.proposalDate),
    "-score": desc(bill.relevanceScore),
    score: asc(bill.relevanceScore),
    "-name": desc(bill.billName),
    name: asc(bill.billName),
  };
  const orderBy = sortMap[sort] ?? sortMap["-date"];

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

  const demoBills = demoMode ? getDemoBills() : [];
  const rows = demoMode
    ? filterAndSortDemoBills(demoBills, {
        q,
        stageFilter,
        minScore,
        cteFilter,
        sort,
      }).slice(0, 200)
    : await db.select().from(bill).where(whereExpr).orderBy(orderBy).limit(200);
  const total = demoMode
    ? demoBills.length
    : (
        await db.select({ total: sql<number>`count(*)::int` }).from(bill)
      )[0]?.total ?? 0;
  const committees = demoMode
    ? summarizeDemoCommittees(demoBills)
    : await db
        .select({
          committee: bill.committee,
          count: sql<number>`count(*)::int`,
        })
        .from(bill)
        .groupBy(bill.committee);
  const proposerImportance = await loadProposerImportanceMap(
    rows.map((entry) => ({
      name: entry.proposerName,
      party: entry.proposerParty,
    })),
    importanceById,
  );

  return (
    <>
      <PageHeader
        title="입법 레이더"
        subtitle={`${total}건 중 ${rows.length}건 표시`}
      />
      {profile && (
        <ContextStrip
          industryName={profile.name}
          stats={[
            { label: "전체", value: total },
            { label: "필터", value: rows.length },
          ]}
        />
      )}

      {/* Filter bar */}
      <FilterBar
        currentParams={sp}
        committees={committees
          .filter((c) => c.committee)
          .sort((a, b) => b.count - a.count)}
      />

      {/* Table */}
      <div className="mx-6 mb-6 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-[var(--color-surface-2)]">
              <tr className="border-b border-[var(--color-border)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
                <SortHeader
                  label="발의일"
                  sortKey="date"
                  currentSort={sort}
                  params={sp}
                />
                <SortHeader
                  label="의안명"
                  sortKey="name"
                  currentSort={sort}
                  params={sp}
                />
                <th className="px-3 py-2">단계</th>
                <th className="hidden px-3 py-2 md:table-cell">소관위</th>
                <th className="hidden px-3 py-2 md:table-cell">대표발의</th>
                <SortHeader
                  label="중요도"
                  sortKey="score"
                  currentSort={sort}
                  params={sp}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[13px] text-[var(--color-text-tertiary)]">
                    조건에 맞는 법안이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <BillRow
                    key={b.id}
                    bill={b}
                    proposerImportance={
                      proposerImportance.get(makeProposerKey(b.proposerName, b.proposerParty))
                        ?.importance ?? null
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLegislatorId && (
        <LegislatorProfileSlideOver
          legislatorId={selectedLegislatorId}
          closeHref={buildHref({ ...sp, legislator: undefined })}
          importance={importanceById.get(selectedLegislatorId) ?? null}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Filter bar — checkbox chips + search + sort
 * ────────────────────────────────────────────────────────────── */

function FilterBar({
  currentParams,
  committees,
}: {
  currentParams: SearchParams;
  committees: Array<{ committee: string | null; count: number }>;
}) {
  const stages: Array<{ value: string; label: string }> = [
    { value: "stage_1", label: "발의" },
    { value: "stage_2", label: "상임위" },
    { value: "stage_3", label: "법사위" },
    { value: "stage_4", label: "본회의" },
    { value: "stage_5", label: "이송" },
    { value: "stage_6", label: "공포" },
  ];
  const minScores = [
    { value: "", label: "전체" },
    { value: "3", label: "3+" },
    { value: "4", label: "4+" },
    { value: "5", label: "5" },
  ];

  return (
    <div className="mx-6 mt-4 mb-3 flex flex-wrap items-center gap-3">
      <form method="GET" action="/radar" className="flex flex-wrap items-center gap-2">
        {/* Preserve other filters in hidden inputs */}
        {currentParams.stage && <input type="hidden" name="stage" value={currentParams.stage} />}
        {currentParams.min && <input type="hidden" name="min" value={currentParams.min} />}
        {currentParams.cte && <input type="hidden" name="cte" value={currentParams.cte} />}
        {currentParams.sort && <input type="hidden" name="sort" value={currentParams.sort} />}
        <input
          type="search"
          name="q"
          defaultValue={currentParams.q ?? ""}
          placeholder="의안명/제안자 검색"
          className="w-[240px] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-medium text-white"
        >
          검색
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          단계
        </span>
        <Link
          href={buildHref({ ...currentParams, stage: undefined })}
          className={chipClass(!currentParams.stage)}
        >
          전체
        </Link>
        {stages.map((s) => (
          <Link
            key={s.value}
            href={buildHref({ ...currentParams, stage: s.value })}
            className={chipClass(currentParams.stage === s.value)}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          중요도
        </span>
        {minScores.map((s) => (
          <Link
            key={s.value}
            href={buildHref({ ...currentParams, min: s.value || undefined })}
            className={chipClass((currentParams.min ?? "") === s.value)}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {committees.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
            위원회
          </span>
          <Link
            href={buildHref({ ...currentParams, cte: undefined })}
            className={chipClass(!currentParams.cte)}
          >
            전체
          </Link>
          {committees.slice(0, 6).map((c) => (
            <Link
              key={c.committee ?? "none"}
              href={buildHref({
                ...currentParams,
                cte: c.committee ?? undefined,
              })}
              className={chipClass(currentParams.cte === c.committee)}
              title={c.committee ?? "미지정"}
            >
              {(c.committee ?? "미지정").slice(0, 6)} ({c.count})
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    "rounded-[12px] px-3 py-[3px] text-[11px] font-semibold transition-colors",
    active
      ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
      : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]",
  );
}

function SortHeader({
  label,
  sortKey,
  currentSort,
  params,
  align,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  params: SearchParams;
  align?: "right";
}) {
  const isDesc = currentSort === `-${sortKey}`;
  const isAsc = currentSort === sortKey;
  const nextSort = isDesc ? sortKey : `-${sortKey}`;
  const arrow = isDesc ? "↓" : isAsc ? "↑" : "";
  return (
    <th className={cn("px-3 py-2", align === "right" && "text-right")}>
      <Link
        href={buildHref({ ...params, sort: nextSort })}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
      >
        {label}
        <span className="text-[10px]">{arrow}</span>
      </Link>
    </th>
  );
}

function BillRow({
  bill: b,
  proposerImportance,
}: {
  bill: Bill;
  proposerImportance?: ImportanceRecord | null;
}) {
  const href = billHref(b.id);
  return (
    <tr
      className="border-b border-[var(--color-border)] transition-colors last:border-b-0 hover:bg-[var(--color-surface-2)]"
    >
      <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-[var(--color-text-secondary)]">
        {b.proposalDate
          ? b.proposalDate.toISOString().slice(0, 10)
          : "—"}
      </td>
      <td className="max-w-[400px] px-3 py-2">
        <Link
          href={href}
          className="block truncate font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
          title={b.billName}
        >
          {b.billName}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <StageBadge stage={b.stage} />
      </td>
      <td className="hidden max-w-[180px] truncate px-3 py-2 text-[11px] text-[var(--color-text-secondary)] md:table-cell">
        {b.committee ?? "—"}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] text-[var(--color-text-secondary)] md:table-cell">
        <span className="inline-flex items-center gap-1">
          {b.proposerName}
          <LegislatorImportanceStar
            level={proposerImportance?.level ?? null}
            size={12}
            reasons={proposerImportance?.reasons}
          />
          {b.proposerParty && (
            <span className="ml-1 text-[var(--color-text-tertiary)]">
              ({b.proposerParty})
            </span>
          )}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {b.relevanceScore !== null ? (
          <RelevanceScoreBadge score={b.relevanceScore} showNumber={false} />
        ) : (
          <span className="text-[11px] text-[var(--color-text-tertiary)]">—</span>
        )}
      </td>
    </tr>
  );
}

/** Build a /radar href preserving + overriding query params. */
function buildHref(params: SearchParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/radar?${qs}` : "/radar";
}

function filterAndSortDemoBills(
  rows: Bill[],
  input: {
    q: string;
    stageFilter: string;
    minScore: number;
    cteFilter: string;
    sort: string;
  },
): Bill[] {
  const filtered = rows.filter((entry) => {
    if (
      input.q &&
      !`${entry.billName} ${entry.proposerName}`.toLowerCase().includes(input.q.toLowerCase())
    ) {
      return false;
    }
    if (input.stageFilter && entry.stage !== input.stageFilter) {
      return false;
    }
    if (input.minScore > 0 && (entry.relevanceScore ?? 0) < input.minScore) {
      return false;
    }
    if (input.cteFilter && entry.committee !== input.cteFilter) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered];
  sorted.sort((left, right) => {
    switch (input.sort) {
      case "date":
        return compareDate(left.proposalDate, right.proposalDate);
      case "-score":
        return (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0);
      case "score":
        return (left.relevanceScore ?? 0) - (right.relevanceScore ?? 0);
      case "-name":
        return right.billName.localeCompare(left.billName, "ko");
      case "name":
        return left.billName.localeCompare(right.billName, "ko");
      case "-date":
      default:
        return compareDate(right.proposalDate, left.proposalDate);
    }
  });

  return sorted;
}

function summarizeDemoCommittees(rows: Bill[]) {
  const map = new Map<string | null, number>();
  for (const entry of rows) {
    map.set(entry.committee, (map.get(entry.committee) ?? 0) + 1);
  }
  return [...map.entries()].map(([committee, count]) => ({ committee, count }));
}

function compareDate(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? 0) - (right?.getTime() ?? 0);
}
