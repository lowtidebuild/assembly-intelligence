/**
 * /briefing — 브리핑봇 landing page.
 *
 * ParlaWatch variant-C structure:
 *   topbar
 *   context strip (industry + counts)
 *   2-column content
 *     left: 오늘의 핵심 (top-4 bills) + 오늘의 일정 + 신규 발의
 *     right: 의원 활동 + 관련 뉴스 + Gemini 브리핑 HTML
 *
 * Server component. Pulls from DB — the morning sync already scored
 * bills and generated the briefing HTML. We also prefer the saved
 * bill id snapshots from `daily_briefing` so the left-column cards
 * stay aligned with the generated HTML/counts for that morning.
 */

import { db } from "@/db";
import {
  bill,
  dailyBriefing,
  industryCommittee,
  industryProfile,
  legislationNotice,
  type Bill,
  type LegislationNotice,
} from "@/db/schema";
import { neon } from "@neondatabase/serverless";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { BillKeyCard } from "@/components/bill-key-card";
import { LegislatorProfileSlideOver } from "@/components/legislator-profile-slide-over";
import { todayKst, weekdayKo } from "@/lib/dashboard-data";
import {
  computeImportance,
  type ImportanceRecord,
  loadProposerImportanceMap,
  makeProposerKey,
} from "@/lib/legislator-importance";
import { loadRecentNews } from "@/services/news-sync";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo-mode";
import { FileText, RefreshCw, Newspaper, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic"; // always fresh DB reads

const rawSql = neon(process.env.DATABASE_URL!);

export default async function BriefingPage(props: {
  searchParams: Promise<{ legislator?: string }>;
}) {
  const sp = await props.searchParams;
  const selectedLegislatorId = sp.legislator
    ? Number.parseInt(sp.legislator, 10)
    : null;
  const [profile] = await db.select().from(industryProfile).limit(1);
  const today = todayKst();

  if (!profile) {
    return (
      <EmptyState
        title="환영합니다! 설정을 시작하세요"
        message="산업을 선택하고 키워드/위원회/의원을 구성하세요. 1분이면 충분합니다."
        ctaLabel="설정 시작하기"
        ctaHref="/setup"
      />
    );
  }

  const committees = await db
    .select({ committeeCode: industryCommittee.committeeCode })
    .from(industryCommittee)
    .where(eq(industryCommittee.industryProfileId, profile.id));

  let briefing: BriefingSnapshot | null = null;
  let relevantNotices: LegislationNotice[] = [];
  let newsItems: Awaited<ReturnType<typeof loadRecentNewsCompat>> = [];
  let importanceById = new Map<number, ImportanceRecord>();
  let topBills: Bill[] = [];
  let recentBills: Bill[] = [];
  let proposerImportance = new Map<
    string,
    {
      legislatorId: number;
      importance: ImportanceRecord;
    }
  >();

  try {
    [briefing, relevantNotices, newsItems, importanceById] = await Promise.all([
      loadLatestBriefingCompat(),
      loadRelevantNoticesCompat(),
      loadRecentNewsCompat(8),
      loadBriefingImportanceCompat({
        profileId: profile.id,
        committeeCodes: committees.map((c) => c.committeeCode),
      }),
    ]);

    [topBills, recentBills] = briefing
      ? await Promise.all([
          loadBriefingBillSnapshot({
            ids: briefing.keyBillIds,
            expectedCount: briefing.keyItemCount,
            fallbackLoader: loadCurrentTopBills,
          }),
          loadBriefingBillSnapshot({
            ids: briefing.newBillIds,
            expectedCount: briefing.newBillCount,
            fallbackLoader: loadCurrentNewBills,
          }),
        ])
      : await Promise.all([loadCurrentTopBills(), loadCurrentNewBills()]);

    proposerImportance = await loadProposerImportanceMap(
      topBills.map((entry) => ({
        name: entry.proposerName,
        party: entry.proposerParty,
      })),
      importanceById,
    );
  } catch (err) {
    console.error("[briefing] degraded render fallback", err);
  }

  const demoFallbackContent = isDemoMode()
    ? buildDemoPageFallback()
    : null;

  const displayTopBills =
    topBills.length > 0 ? topBills : demoFallbackContent?.topBills ?? [];
  const displayRecentBills =
    recentBills.length > 0 ? recentBills : demoFallbackContent?.recentBills ?? [];
  const displayRelevantNotices = relevantNotices;
  const displayNewsItems =
    newsItems.length > 0 ? newsItems : demoFallbackContent?.newsItems ?? [];

  const renderedBriefing =
    briefing ??
    (isDemoMode()
      ? topBills.length === 0 &&
        recentBills.length === 0 &&
        relevantNotices.length === 0
        ? buildStaticDemoBriefing({
            date: today,
            industryName: profile.name,
          })
        : buildDemoFallbackBriefing({
            date: today,
            industryName: profile.name,
            topBills: displayTopBills,
            recentBills: displayRecentBills,
            relevantNotices: displayRelevantNotices,
          })
      : null);

  return (
    <>
      <PageHeader
        title="브리핑봇"
        subtitle={`${today} ${weekdayKo(today)} · ${profile.name} 산업`}
        actions={
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
            title="새로고침"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      />
      <ContextStrip
        industryName={profile.name}
        stats={[
          { label: "핵심", value: displayTopBills.length },
          { label: "일정", value: renderedBriefing?.scheduleCount ?? 0 },
          { label: "신규", value: renderedBriefing?.newBillCount ?? 0 },
          { label: "전체", value: displayRecentBills.length },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 p-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT COLUMN */}
        <div className="min-w-0">
          <Section title="오늘의 핵심" sublabel="Gemini 평가" count={displayTopBills.length}>
            {displayTopBills.length === 0 ? (
              <SectionEmpty message="오늘 올릴 핵심 법안이 없습니다. 아직 아침 동기화가 돌지 않았을 수 있어요." />
            ) : (
              <div className="flex flex-col gap-[10px]">
                {displayTopBills.map((b, i) => (
                  <BillKeyCard
                    key={b.id}
                    number={String(i + 1).padStart(2, "0")}
                    bill={b}
                    proposerImportance={
                      proposerImportance.get(makeProposerKey(b.proposerName, b.proposerParty))
                        ?.importance ?? null
                    }
                    proposerHref={
                      proposerImportance.get(makeProposerKey(b.proposerName, b.proposerParty))
                        ? `/briefing?legislator=${proposerImportance.get(makeProposerKey(b.proposerName, b.proposerParty))?.legislatorId}`
                        : null
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {displayRelevantNotices.length > 0 && (
            <Section
              title="입법예고"
              sublabel="의견제출 마감일 기준"
              count={displayRelevantNotices.length}
            >
              <div className="flex flex-col gap-[6px]">
                {displayRelevantNotices.map((notice) => (
                  <LegislationNoticeRow key={notice.id} notice={notice} />
                ))}
              </div>
            </Section>
          )}

          <Section title="신규 발의" count={displayRecentBills.length}>
            {displayRecentBills.length === 0 ? (
              <SectionEmpty message="최근 24시간 신규 발의 없음." />
            ) : (
              <div className="flex flex-col gap-[6px]">
                {displayRecentBills.map((b) => (
                  <NewBillRow key={b.id} bill={b} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <aside className="flex flex-col gap-4">
          <SideSection title="Gemini 브리핑" icon={<FileText className="h-4 w-4" />}>
            {renderedBriefing ? (
              <GeminiBriefingHtml html={renderedBriefing.contentHtml} />
            ) : (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                아직 브리핑이 생성되지 않았습니다.
              </p>
            )}
          </SideSection>

          <SideSection
            title="관련 뉴스"
            icon={<Newspaper className="h-4 w-4" />}
            sublabel="Naver News"
          >
            {displayNewsItems.length === 0 ? (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                아직 수집된 뉴스가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col">
                {displayNewsItems.map((n) => (
                  <NewsRow key={n.id} item={n} />
                ))}
              </ul>
            )}
          </SideSection>
        </aside>
      </div>

      {selectedLegislatorId && (
        <LegislatorProfileSlideOver
          legislatorId={selectedLegislatorId}
          closeHref="/briefing"
          importance={importanceById.get(selectedLegislatorId) ?? null}
        />
      )}
    </>
  );
}

type BriefingSnapshot = {
  id: number;
  date: string;
  contentHtml: string;
  keyItemCount: number;
  scheduleCount: number;
  newBillCount: number;
  keyBillIds: number[];
  newBillIds: number[];
  generatedAt: Date;
};

type BriefingRenderData = Pick<
  BriefingSnapshot,
  "contentHtml" | "keyItemCount" | "scheduleCount" | "newBillCount"
>;

type BriefingNewsItem = Awaited<ReturnType<typeof loadRecentNewsCompat>>[number];

async function loadLatestBriefingCompat(): Promise<BriefingSnapshot | null> {
  try {
    const rows = await db
      .select()
      .from(dailyBriefing)
      .orderBy(desc(dailyBriefing.date))
      .limit(1);

    return rows[0] ?? null;
  } catch (err) {
    if (isMissingDailyBriefingError(err)) {
      return null;
    }

    if (!isLegacyBriefingSchemaError(err)) {
      throw err;
    }

    try {
      const rows = (await rawSql`
        SELECT
          id,
          date,
          content_html,
          key_item_count,
          schedule_count,
          new_bill_count,
          generated_at
        FROM daily_briefing
        ORDER BY date DESC
        LIMIT 1
      `) as Array<{
        id: number;
        date: string;
        content_html: string;
        key_item_count: number;
        schedule_count: number;
        new_bill_count: number;
        generated_at: string | Date;
      }>;

      const row = rows[0];
      if (!row) {
        return null;
      }

      return {
        id: row.id,
        date: row.date,
        contentHtml: row.content_html,
        keyItemCount: row.key_item_count,
        scheduleCount: row.schedule_count,
        newBillCount: row.new_bill_count,
        keyBillIds: [],
        newBillIds: [],
        generatedAt:
          row.generated_at instanceof Date
            ? row.generated_at
            : new Date(row.generated_at),
      };
    } catch (rawErr) {
      if (isMissingDailyBriefingError(rawErr)) {
        return null;
      }
      throw rawErr;
    }
  }
}

function isLegacyBriefingSchemaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("key_bill_ids") ||
    message.includes("new_bill_ids") ||
    message.includes("column") ||
    message.includes("does not exist")
  );
}

function isMissingDailyBriefingError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("daily_briefing") &&
    (message.includes("relation") ||
      message.includes("does not exist") ||
      message.includes("no such table"))
  );
}

async function loadRelevantNoticesCompat(): Promise<LegislationNotice[]> {
  try {
    return await db
      .select()
      .from(legislationNotice)
      .where(
        and(
          eq(legislationNotice.isRelevant, true),
          sql`${legislationNotice.noticeEndDate} >= CURRENT_DATE`,
        ),
      )
      .orderBy(asc(legislationNotice.noticeEndDate))
      .limit(10);
  } catch (err) {
    if (!isMissingLegislationNoticeError(err)) {
      throw err;
    }
    return [];
  }
}

async function loadBriefingImportanceCompat(input: {
  profileId: number;
  committeeCodes: string[];
}): Promise<Map<number, ImportanceRecord>> {
  try {
    return await computeImportance(input);
  } catch (err) {
    if (!isMissingLegislatorImportanceSchemaError(err)) {
      throw err;
    }
    return new Map<number, ImportanceRecord>();
  }
}

async function loadRecentNewsCompat(limit: number) {
  try {
    return await loadRecentNews(limit);
  } catch (err) {
    if (!isMissingNewsArticleError(err)) {
      throw err;
    }
    return [];
  }
}

function isMissingLegislationNoticeError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("legislation_notice") &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("does not exist"))
  );
}

function isMissingNewsArticleError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("news_article") &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("does not exist"))
  );
}

function isMissingLegislatorImportanceSchemaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("industry_legislator_watch") ||
    message.includes("committee_role") ||
    message.includes("term_history") ||
    message.includes("does not exist") ||
    message.includes("relation")
  );
}

async function loadBriefingBillSnapshot({
  ids,
  expectedCount,
  fallbackLoader,
}: {
  ids: number[];
  expectedCount: number;
  fallbackLoader: () => Promise<Bill[]>;
}): Promise<Bill[]> {
  if (ids.length > 0) {
    return loadBillsByIdOrder(ids);
  }

  if (expectedCount === 0) {
    return [];
  }

  return fallbackLoader();
}

async function loadBillsByIdOrder(ids: number[]): Promise<Bill[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(bill).where(inArray(bill.id, ids));
  const order = new Map(ids.map((id, index) => [id, index]));
  return rows.sort((left, right) => {
    return (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

async function loadCurrentTopBills(): Promise<Bill[]> {
  return db
    .select()
    .from(bill)
    .where(sql`${bill.relevanceScore} >= 4`)
    .orderBy(desc(bill.relevanceScore), desc(bill.proposalDate))
    .limit(4);
}

async function loadCurrentNewBills(): Promise<Bill[]> {
  return db
    .select()
    .from(bill)
    .where(sql`${bill.createdAt} > NOW() - INTERVAL '24 hours'`)
    .orderBy(desc(bill.createdAt), desc(bill.proposalDate))
    .limit(10);
}

function NewsRow({
  item,
}: {
  item: {
    id: number;
    title: string;
    url: string;
    source: string | null;
    description: string | null;
    publishedAt: Date | null;
  };
}) {
  const publishedDate = formatIsoDate(item.publishedAt);

  return (
    <li className="border-b border-[var(--color-border)] py-[10px] last:border-b-0 last:pb-0 first:pt-0">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
      >
        <div className="mb-1 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
          <span className="line-clamp-2 flex-1">{item.title}</span>
          <ExternalLink className="mt-[2px] h-3 w-3 shrink-0 text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
          {item.source && (
            <span className="font-semibold text-[var(--color-primary)]">
              {item.source}
            </span>
          )}
          {item.source && publishedDate && <span>·</span>}
          {publishedDate && <span>{publishedDate}</span>}
        </div>
      </a>
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Small subcomponents local to this page
 * ────────────────────────────────────────────────────────────── */

function Section({
  title,
  sublabel,
  count,
  children,
}: {
  title: string;
  sublabel?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-3 flex items-center gap-[10px] border-b-2 border-[var(--color-border)] px-1 py-[6px] text-[15px] font-bold text-[var(--color-text)]">
        <span>{title}</span>
        {sublabel && (
          <span className="text-[12px] font-normal text-[var(--color-text-secondary)]">
            · {sublabel}
          </span>
        )}
        {count !== undefined && (
          <span className="ml-auto text-[12px] font-normal text-[var(--color-text-secondary)]">
            {count}건
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function SectionEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-[13px] text-[var(--color-text-tertiary)]">
      {message}
    </div>
  );
}

function SideSection({
  title,
  sublabel,
  icon,
  children,
}: {
  title: string;
  sublabel?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-[14px] shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-[10px] text-[13px] font-bold text-[var(--color-text)]">
        {icon}
        {title}
        {sublabel && (
          <span className="text-[10px] font-normal text-[var(--color-text-tertiary)]">
            · {sublabel}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function NewBillRow({
  bill: b,
}: {
  bill: {
    id: number;
    billName: string;
    proposerName: string;
    proposerParty: string | null;
    proposalDate: Date | null;
    relevanceScore: number | null;
  };
}) {
  const proposalDate = formatMonthDay(b.proposalDate);

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px]">
      {proposalDate && (
        <span className="shrink-0 rounded-[4px] bg-[var(--color-surface-2)] px-[7px] py-[2px] font-mono text-[11px] font-semibold text-[var(--color-text-secondary)]">
          {proposalDate}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text)]">
        {b.billName}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">
        {b.proposerName}
        {b.proposerParty && (
          <PartyBadge party={b.proposerParty} className="ml-1" />
        )}
      </span>
    </div>
  );
}

function LegislationNoticeRow({
  notice,
}: {
  notice: LegislationNotice;
}) {
  const daysLeft = daysLeftFromToday(notice.noticeEndDate);
  const isUrgent = daysLeft !== null && daysLeft <= 3;

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px]">
      <span
        className={cn(
          "shrink-0 rounded-[4px] px-[7px] py-[2px] font-mono text-[11px] font-semibold",
          isUrgent
            ? "bg-[var(--color-error)] text-white"
            : "bg-[var(--color-warning)] text-[#78350f]",
        )}
      >
        {daysLeft !== null ? `D-${daysLeft}` : notice.noticeEndDate ?? "마감일 미정"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-text)]">
        {notice.billName}
      </span>
      <span className="shrink-0 text-[11px] text-[var(--color-text-secondary)]">
        {notice.committee ?? notice.proposerType ?? "위원회 미정"}
      </span>
    </div>
  );
}

function PartyBadge({
  party,
  className,
}: {
  party: string;
  className?: string;
}) {
  const color =
    party === "더불어민주당"
      ? "bg-[#dbeafe] text-[#1d4ed8]"
      : party === "국민의힘"
        ? "bg-[#fee2e2] text-[#b91c1c]"
        : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]";
  const label =
    party === "더불어민주당"
      ? "민주"
      : party === "국민의힘"
        ? "국힘"
        : party.slice(0, 2);
  return (
    <span
      className={`inline-block rounded-[8px] px-[6px] py-[1px] text-[10px] font-semibold ${color} ${className ?? ""}`}
    >
      {label}
    </span>
  );
}

function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date =
    value instanceof Date ? value : new Date(typeof value === "string" ? value : "");
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDate(value: Date | string | null | undefined): string | null {
  const date = normalizeDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10).replaceAll("-", ".");
}

function formatMonthDay(value: Date | string | null | undefined): string | null {
  const date = normalizeDate(value);
  if (!date) return null;
  return date.toISOString().slice(5, 10);
}

function formatKoreanDisplayDate(value: Date | string | null | undefined): string | null {
  const date = normalizeDate(value);
  if (!date) return null;
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildDemoFallbackBriefing({
  date,
  industryName,
  topBills,
  recentBills,
  relevantNotices,
}: {
  date: string;
  industryName: string;
  topBills: Bill[];
  recentBills: Bill[];
  relevantNotices: LegislationNotice[];
}): BriefingRenderData | null {
  if (topBills.length === 0 && recentBills.length === 0 && relevantNotices.length === 0) {
    return buildStaticDemoBriefing({
      date,
      industryName,
    });
  }

  const displayDate = formatKoreanDisplayDate(date) ?? date;
  const headlineLines = [
    topBills.length > 0
      ? `${industryName} 산업 관련 핵심 법안 ${topBills.length}건이 현재 우선 모니터링 대상으로 올라와 있습니다.`
      : null,
    topBills[0]
      ? `'${escapeHtml(topBills[0].billName)}'이(가) 오늘 브리핑의 최우선 체크 포인트입니다.`
      : null,
    recentBills.length > 0
      ? `최근 발의 ${recentBills.length}건이 추가로 잡혀 있어 상임위 흐름과 발의자 동향을 함께 봐야 합니다.`
      : relevantNotices.length > 0
        ? `입법예고 ${relevantNotices.length}건이 열려 있어 외부 의견제출 일정까지 함께 챙겨야 합니다.`
        : "오늘은 신규 변동보다 기존 계류 법안의 진행 상황을 추적하는 쪽이 더 중요합니다.",
  ].filter((line): line is string => Boolean(line));

  const keyBillsHtml =
    topBills.length === 0
      ? "<p>(오늘은 해당 없음)</p>"
      : topBills
          .slice(0, 3)
          .map((item) => {
            const proposer = `${escapeHtml(item.proposerName)}${
              item.proposerParty ? ` (${escapeHtml(item.proposerParty)})` : ""
            }`;
            const summary =
              item.summaryText?.trim() ||
              "현재 저장된 요약이 없어 제목과 소관위 중심으로 우선 추적이 필요합니다.";
            return `
              <div class="bill-card">
                <h3 class="bill-title">${escapeHtml(item.billName)}</h3>
                <p class="bill-proposer"><strong>제안자:</strong> ${proposer}</p>
                <p class="bill-analysis">${escapeHtml(summary)}</p>
              </div>
            `.trim();
          })
          .join("");

  const scheduleItems = relevantNotices
    .slice(0, 3)
    .map((notice) => {
      const label = notice.noticeEndDate
        ? `[의견제출 ${escapeHtml(notice.noticeEndDate)}]`
        : "[입법예고]";
      return `<li><strong>${label}</strong> — ${escapeHtml(notice.billName)}${
        notice.committee ? ` @ ${escapeHtml(notice.committee)}` : ""
      }</li>`;
    })
    .join("");

  const newBillsHtml =
    recentBills.length === 0
      ? "<p>(오늘은 해당 없음)</p>"
      : `<ul>${recentBills
          .slice(0, 5)
          .map((item) => {
            const proposer = `${escapeHtml(item.proposerName)}${
              item.proposerParty ? ` (${escapeHtml(item.proposerParty)})` : ""
            }`;
            return `<li>${escapeHtml(item.billName)} — ${proposer}</li>`;
          })
          .join("")}</ul>`;

  const summaryLine =
    topBills[0]
      ? `오늘은 핵심 법안 '${escapeHtml(topBills[0].billName)}'을 중심으로 발의자와 소관위 움직임을 함께 추적할 필요가 있습니다.`
      : `${industryName} 산업 관련 신규 변동은 제한적이지만, 저장된 입법 데이터의 흐름을 계속 관찰하는 날입니다.`;

  return {
    contentHtml: `
      <article class="briefing">
        <header class="briefing-header">
          <p class="briefing-date">${escapeHtml(displayDate)} | ${escapeHtml(industryName)} 인텔리전스</p>
          <h1 class="briefing-title">오늘의 헤드라인</h1>
        </header>

        <section class="briefing-headlines">
          <ul>
            ${headlineLines.map((line) => `<li>${line}</li>`).join("")}
          </ul>
        </section>

        <section class="briefing-key-bills">
          <h2>핵심 법안</h2>
          ${keyBillsHtml}
        </section>

        <section class="briefing-schedule">
          <h2>오늘/이번주 일정</h2>
          ${scheduleItems ? `<ul>${scheduleItems}</ul>` : "<p>(오늘은 해당 없음)</p>"}
        </section>

        <section class="briefing-new-bills">
          <h2>신규 발의</h2>
          ${newBillsHtml}
        </section>

        <footer class="briefing-footer">
          <p class="briefing-summary">${summaryLine}</p>
        </footer>
      </article>
    `.trim(),
    keyItemCount: topBills.length,
    scheduleCount: relevantNotices.length,
    newBillCount: recentBills.length,
  };
}

function buildStaticDemoBriefing({
  date,
  industryName,
}: {
  date: string;
  industryName: string;
}): BriefingRenderData {
  const displayDate = formatKoreanDisplayDate(date) ?? date;
  const safeIndustryName = escapeHtml(industryName);

  return {
    contentHtml: `
      <article class="briefing">
        <header class="briefing-header">
          <p class="briefing-date">${escapeHtml(displayDate)} | ${safeIndustryName} 인텔리전스</p>
          <h1 class="briefing-title">오늘의 헤드라인</h1>
        </header>

        <section class="briefing-headlines">
          <ul>
            <li>게임산업의 근간이 되는 '게임산업진흥법' 개정안이 여야를 막론하고 다수 발의되어 핵심 규제 변화를 예고합니다.</li>
            <li>확률형 아이템, P2E, 등급분류 등 핵심 비즈니스 모델에 직접적 영향을 미치는 조항들이 논의될 예정입니다.</li>
            <li>신규 발의나 관련 일정이 없는 가운데, 현재 계류 중인 핵심 법안들의 논의 과정에 모든 역량을 집중해야 합니다.</li>
          </ul>
        </section>

        <section class="briefing-key-bills">
          <h2>핵심 법안</h2>
          <div class="bill-card">
            <h3 class="bill-title">게임산업진흥에 관한 법률 일부개정법률안 (다수 발의)</h3>
            <p class="bill-proposer"><strong>제안자:</strong> 김성원, 진종오 (국민의힘), 조계원 (더불어민주당) 등</p>
            <p class="bill-analysis">
              여야를 막론하고 게임산업의 근간 법률인 '게임산업진흥법'에 대한 다수의 개정안이 문화체육관광위원회에 계류 중입니다.
              이 법안들은 공통적으로 확률형 아이템 규제, 등급분류 제도 개선, P2E 등 신기술 수용, 이스포츠 진흥 등 산업의 핵심 영역을 다루고 있습니다.
              이는 당사의 비즈니스 모델과 서비스 운영 전반에 직접적인 영향을 미칠 중대 사안으로, 각 법안의 세부 조항 분석과 통합적인 대응 전략 수립이 시급합니다.
            </p>
          </div>
        </section>

        <section class="briefing-schedule">
          <h2>오늘/이번주 일정</h2>
          <ul>
            <li>(오늘은 해당 일정 없음)</li>
            <li><strong>[주요 예정] 4/22 10:00</strong> — 아동·청소년 SNS 규제추세에 따른 대응방안 모색 @ 의원회관 제10간담회의실</li>
            <li><strong>[예정] 4/16 15:00</strong> — 직장 내 괴롭힘, 왜 반복되는가 -일터의 존엄과 안전을 위한 제도 개선 과제- @ 의원회관 제4간담회의실</li>
          </ul>
        </section>

        <section class="briefing-new-bills">
          <h2>신규 발의</h2>
          <p>(오늘은 해당 없음)</p>
        </section>

        <footer class="briefing-footer">
          <p class="briefing-summary">
            핵심 법안인 '게임산업진흥법' 개정안들의 동향에 대한 면밀한 <strong>주의</strong>가 필요한 날입니다.
          </p>
        </footer>
      </article>
    `.trim(),
    keyItemCount: 4,
    scheduleCount: 69,
    newBillCount: 0,
  };
}

function buildDemoPageFallback(): {
  topBills: Bill[];
  recentBills: Bill[];
  newsItems: BriefingNewsItem[];
} {
  const topBills = [
    makeDemoBill({
      id: 9001,
      billId: "DEMO_BILL_9001",
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      proposerName: "진종오",
      proposerParty: "국민의힘",
      committee: "문화체육관광위원회",
      proposalDate: "2026-03-29T00:00:00.000Z",
      relevanceScore: 5,
      summaryText:
        "게임산업진흥에 관한 법률 개정안은 현재의 게임 관련 규제들을 시대에 맞게 개선하려는 목적을 가지고 있습니다. 이는 게임 산업의 성장과 발전을 저해하는 불필요한 규제를 완화하고, 새로운 기술 및 서비스 도입을 촉진하여 국내 게임 산업의 경쟁력을 강화하기 위함입니다. 이 개정안은 게임 개발사, 유통사, 그리고 게임 이용자들에게 직접적인 영향을 미 미칠 것으로 보입니다.",
    }),
    makeDemoBill({
      id: 9002,
      billId: "DEMO_BILL_9002",
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      proposerName: "조계원",
      proposerParty: "더불어민주당",
      committee: "문화체육관광위원회",
      proposalDate: "2026-03-05T00:00:00.000Z",
      relevanceScore: 5,
      summaryText:
        "게임산업진흥에 관한 법률 개정안은 현재 게임 산업을 규제하는 법률을 현대화하고 개선하려는 목적을 가지고 있습니다. 이는 빠르게 변화하는 게임 산업 환경에 발맞춰 새로운 기술과 서비스 모델을 포용하고, 산업의 지속적인 성장과 혁신을 지원하기 위함입니다. 궁극적으로는 게임 개발사, 유통사, 그리고 게임 이용자 모두에게 더 나은 환경을 제공하는 것을 목표로 합니다.",
    }),
    makeDemoBill({
      id: 9003,
      billId: "DEMO_BILL_9003",
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      proposerName: "김성원",
      proposerParty: "국민의힘",
      committee: "문화체육관광위원회",
      proposalDate: "2026-03-03T00:00:00.000Z",
      relevanceScore: 5,
      summaryText:
        "게임산업진흥에 관한 법률 일부개정법률안은 현재 게임 산업을 규제하는 법을 시대에 맞게 고치고, 새로운 기술이나 서비스가 나올 때마다 법을 바꾸는 번거로움을 줄이려 합니다. 이는 게임 산업의 성장을 돕고, 이용자들을 더 잘 보호하기 위함입니다. 이 법안은 게임 개발사, 유통사 그리고 게임 이용자들에게 직접적인 영향을 미칠 것입니다.",
    }),
    makeDemoBill({
      id: 9004,
      billId: "DEMO_BILL_9004",
      billName: "게임산업진흥에 관한 법률 일부개정법률안",
      proposerName: "김성원",
      proposerParty: "국민의힘",
      committee: "문화체육관광위원회",
      proposalDate: "2026-02-24T00:00:00.000Z",
      relevanceScore: 5,
      summaryText:
        "게임산업진흥에 관한 법률 일부개정법률안은 현재의 게임 관련 법규를 시대에 맞게 손질하여 게임 산업의 성장을 돕고 건전한 게임 문화를 만들려는 목적을 가지고 있습니다. 이는 빠르게 변화하는 게임 산업의 특성을 반영하고, 새로운 기술과 서비스에 대한 법적 기반을 마련하여 국내 게임 산업의 경쟁력을 높이는 데 기여할 것입니다. 궁극적으로 게임 개발사, 유통사, 그리고 게임 이용자 모두에게 긍정적인 영향을 미칠 것으로 예상됩니다.",
    }),
  ];

  const recentBills = [
    topBills[0],
    makeDemoBill({
      id: 9005,
      billId: "DEMO_BILL_9005",
      billName: "이스포츠(전자스포츠) 진흥에 관한 법률 일부개정법률안",
      proposerName: "진종오",
      proposerParty: "국민의힘",
      committee: "문화체육관광위원회",
      proposalDate: "2026-03-15T00:00:00.000Z",
      relevanceScore: 4,
    }),
    topBills[1],
    topBills[2],
    topBills[3],
  ];

  const newsItems: BriefingNewsItem[] = [
    makeDemoNewsItem({
      id: 9901,
      title: "[창간20년 인터뷰] 이철우 한국게임이용자협회 협회장 \"이용자 대변하는...\"",
      url: "https://www.todaykorea.co.kr/news/articleView.html?idxno=400378",
      source: "todaykorea.co.kr",
      publishedAt: "2026-04-10T00:00:00.000Z",
    }),
    makeDemoNewsItem({
      id: 9902,
      title: "[기자수첩] 게임산업 부흥, 제도가 바뀔 차례",
      url: "https://www.shinailbo.co.kr/news/articleView.html?idxno=5007895",
      source: "shinailbo.co.kr",
      publishedAt: "2026-04-05T00:00:00.000Z",
    }),
    makeDemoNewsItem({
      id: 9903,
      title: "[온라인 게임 30년] '한류 선봉장' 게임산업이지만...이면엔 '낡은 규제...'",
      url: "https://www.techm.kr/news/articleView.html?idxno=150784",
      source: "techm.kr",
      publishedAt: "2026-04-02T00:00:00.000Z",
    }),
    makeDemoNewsItem({
      id: 9904,
      title: "\"개천에서 페이커난다\"... 지역 e스포츠 육성법, 국회 본회의 통과",
      url: "https://www.insight.co.kr/news/548611",
      source: "insight.co.kr",
      publishedAt: "2026-04-02T00:00:00.000Z",
    }),
    makeDemoNewsItem({
      id: 9905,
      title: "‘지역 e스포츠 활성화’ 법제화…지자체가 팀·리그·교육 직접 키운다",
      url: "http://www.metroseoul.co.kr/article/20260402500431",
      source: "metroseoul.co.kr",
      publishedAt: "2026-04-02T00:00:00.000Z",
    }),
    makeDemoNewsItem({
      id: 9906,
      title: "정연욱 의원, e스포츠 진흥법 개정안 통과...지자체 지원 명시",
      url: "https://www.joongdo.co.kr/web/view.php?key=20260402010000707",
      source: "joongdo.co.kr",
      publishedAt: "2026-04-02T00:00:00.000Z",
    }),
  ];

  return {
    topBills,
    recentBills,
    newsItems,
  };
}

function makeDemoBill(input: {
  id: number;
  billId: string;
  billName: string;
  proposerName: string;
  proposerParty: string | null;
  committee: string | null;
  proposalDate: string;
  relevanceScore: number;
  summaryText?: string | null;
}): Bill {
  const timestamp = new Date(input.proposalDate);
  return {
    id: input.id,
    billId: input.billId,
    billName: input.billName,
    proposerName: input.proposerName,
    proposerParty: input.proposerParty,
    coSponsorCount: 0,
    committee: input.committee,
    stage: "stage_2",
    status: "계류중",
    proposalDate: timestamp,
    relevanceScore: input.relevanceScore,
    relevanceReasoning: null,
    proposalReason: null,
    mainContent: null,
    summaryText: input.summaryText ?? null,
    companyImpact: null,
    companyImpactIsAiDraft: false,
    deepAnalysis: null,
    deepAnalysisGeneratedAt: null,
    externalLink: null,
    lastSynced: timestamp,
    createdAt: timestamp,
  };
}

function makeDemoNewsItem(input: {
  id: number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}): BriefingNewsItem {
  return {
    id: input.id,
    billId: null,
    query: "게임 산업",
    title: input.title,
    url: input.url,
    source: input.source,
    description: null,
    publishedAt: new Date(input.publishedAt),
    fetchedAt: new Date(input.publishedAt),
  };
}

function daysLeftFromToday(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  const now = new Date();
  const kstToday = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const targetMs = Date.parse(`${dateOnly}T00:00:00Z`);
  const todayMs = Date.parse(`${kstToday}T00:00:00Z`);
  if (Number.isNaN(targetMs) || Number.isNaN(todayMs)) return null;
  return Math.max(0, Math.round((targetMs - todayMs) / 86400000));
}

/**
 * Render the Gemini-generated briefing HTML.
 *
 * We trust this output because:
 *   1. It comes from OUR own Gemini call, never from user input.
 *   2. The prompt limits it to a specific <article> subtree.
 *   3. Next.js dangerouslySetInnerHTML is the only way to get
 *      server-rendered AI content into the DOM.
 *
 * If we ever start rendering user-supplied HTML, switch to a
 * DOMPurify pass first.
 */
function GeminiBriefingHtml({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm max-w-none [&_article]:text-[12px] [&_h1]:text-[15px] [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-[12px] [&_h2]:font-bold [&_h3]:text-[12px] [&_h3]:font-semibold [&_p]:my-1 [&_p]:text-[12px] [&_p]:leading-relaxed [&_ul]:ml-3 [&_ul]:list-disc [&_ul]:text-[12px]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function EmptyState({
  title,
  message,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-card)]">
        <h2 className="mb-2 text-[18px] font-bold text-[var(--color-text)]">
          {title}
        </h2>
        <p className="mb-6 text-[13px] text-[var(--color-text-secondary)]">
          {message}
        </p>
        {ctaLabel && ctaHref && (
          <a
            href={ctaHref}
            className="inline-block rounded-[var(--radius)] bg-[var(--color-primary)] px-4 py-2 text-[14px] font-medium text-white"
          >
            {ctaLabel}
          </a>
        )}
      </div>
    </div>
  );
}
