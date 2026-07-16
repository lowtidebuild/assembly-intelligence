/**
 * /briefing — 브리핑봇 landing page.
 *
 * ParlaWatch variant-C structure:
 *   topbar
 *   context strip (industry + counts)
 *   2-column content
 *     left: 오늘의 핵심 (top-4 bills) + 오늘의 일정 + 신규 발의
 *     right: 의원 활동 + 관련 뉴스 + 구조화된 Gemini 브리핑
 *
 * Server component. Pulls from DB — the morning sync already scored
 * bills and generated the structured briefing. We also prefer the saved
 * bill id snapshots from `daily_briefing` so the left-column cards
 * stay aligned with the generated HTML/counts for that morning.
 */

import Link from "next/link";
import { db } from "@/db";
import {
  bill,
  dailyBriefing,
  industryCommittee,
  legislationNotice,
  petitionItem,
  pressRelease,
  type Bill,
  type LegislationNotice,
  type PetitionItem,
  type PressRelease,
} from "@/db/schema";
import { neon } from "@neondatabase/serverless";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { BillKeyCard } from "@/components/bill-key-card";
import { DailyBriefingRenderer } from "@/components/daily-briefing-renderer";
import { todayKst, weekdayKo } from "@/lib/dashboard-data";
import {
  type ImportanceRecord,
  loadCachedImportance,
  loadProposerImportanceMap,
  makeProposerKey,
} from "@/lib/legislator-importance";
import { buildTranscriptSnippet } from "@/lib/transcript-parser";
import { loadRecentNews } from "@/services/news-sync";
import { loadRecentTranscriptHits } from "@/services/transcript-sync";
import { cn } from "@/lib/utils";
import { billHref } from "@/lib/routes";
import { isDemoMode } from "@/lib/demo-mode";
import {
  flattenErrorText,
  loadActiveIndustryProfileCompat,
  withDbReadRetry,
} from "@/lib/db-compat";
import {
  getDemoNewsItems,
  getDemoRecentBills,
  getDemoTopBills,
  getDemoTranscriptHits,
} from "@/lib/demo-content";
import {
  buildFallbackDailyBriefingContent,
  type DailyBriefingContent,
} from "@/lib/daily-briefing-content";
import { FileText, RefreshCw, Newspaper, ExternalLink, MessagesSquare } from "lucide-react";

export const revalidate = 60;

const rawSql = neon(process.env.DATABASE_URL!);

export default async function BriefingPage() {
  const profile = await withDbReadRetry(() => loadActiveIndustryProfileCompat());
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

  const committees = await withDbReadRetry(() =>
    db
      .select({ committeeCode: industryCommittee.committeeCode })
      .from(industryCommittee)
      .where(eq(industryCommittee.industryProfileId, profile.id)),
  );

  let briefing: BriefingSnapshot | null = null;
  let relevantNotices: LegislationNotice[] = [];
  let relevantPetitions: PetitionItem[] = [];
  let relevantPress: PressRelease[] = [];
  let transcriptHits: Awaited<ReturnType<typeof loadRecentTranscriptHitsCompat>> = [];
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
    [briefing, relevantNotices, relevantPetitions, relevantPress, transcriptHits, newsItems, importanceById] =
      await withDbReadRetry(() =>
        Promise.all([
          loadLatestBriefingCompat(),
          loadRelevantNoticesCompat(),
          loadRelevantPetitionsCompat(),
          loadRelevantPressReleasesCompat(),
          loadRecentTranscriptHitsCompat(),
          loadRecentNewsCompat(8),
          loadBriefingImportanceCompat({
            profileId: profile.id,
            committeeCodes: committees.map((c) => c.committeeCode),
          }),
        ]),
      );

    if (briefing) {
      const snapshot = briefing;
      [topBills, recentBills] = await withDbReadRetry(() =>
        Promise.all([
          loadBriefingBillSnapshot({
            ids: snapshot.keyBillIds,
            expectedCount: snapshot.keyItemCount,
            fallbackLoader: loadCurrentTopBills,
          }),
          loadBriefingBillSnapshot({
            ids: snapshot.newBillIds,
            expectedCount: snapshot.newBillCount,
            fallbackLoader: loadCurrentNewBills,
          }),
        ]),
      );
    } else {
      [topBills, recentBills] = await withDbReadRetry(() =>
        Promise.all([loadCurrentTopBills(), loadCurrentNewBills()]),
      );
    }

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
  const displayTranscriptHits =
    transcriptHits.length > 0
      ? transcriptHits
      : isDemoMode()
        ? getDemoTranscriptHits(6)
        : [];

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
                        ? `/legislators/${proposerImportance.get(makeProposerKey(b.proposerName, b.proposerParty))?.legislatorId}`
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
            {renderedBriefing?.contentJson ? (
              <DailyBriefingRenderer content={renderedBriefing.contentJson} />
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

          {relevantPetitions.length > 0 && (
            <SideSection title="청원 동향" sublabel="assembly_org(type=petition)">
              <ul className="flex flex-col">
                {relevantPetitions.map((item) => (
                  <PetitionRow key={item.id} item={item} />
                ))}
              </ul>
            </SideSection>
          )}

          {relevantPress.length > 0 && (
            <SideSection title="공식 보도자료" sublabel="assembly_org(type=press)">
              <ul className="flex flex-col">
                {relevantPress.map((item) => (
                  <PressReleaseRow key={item.id} item={item} />
                ))}
              </ul>
            </SideSection>
          )}

          {displayTranscriptHits.length > 0 && (
            <SideSection
              title="회의록 동향"
              icon={<MessagesSquare className="h-4 w-4" />}
              sublabel="최근 키워드 언급"
            >
              <ul className="flex flex-col">
                {displayTranscriptHits.map((item) => (
                  <TranscriptHitRow
                    key={`${item.minutesId}-${item.speakerName}-${item.snippet ?? "none"}`}
                    item={item}
                  />
                ))}
              </ul>
            </SideSection>
          )}
        </aside>
      </div>
    </>
  );
}

type BriefingSnapshot = {
  id: number;
  date: string;
  contentHtml: string;
  contentJson: DailyBriefingContent | null;
  keyItemCount: number;
  scheduleCount: number;
  newBillCount: number;
  keyBillIds: number[];
  newBillIds: number[];
  generatedAt: Date;
};

type BriefingRenderData = Pick<
  BriefingSnapshot,
  | "contentJson"
  | "keyItemCount"
  | "scheduleCount"
  | "newBillCount"
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
        contentJson: null,
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

async function loadRelevantPetitionsCompat(): Promise<PetitionItem[]> {
  try {
    return await db
      .select()
      .from(petitionItem)
      .where(eq(petitionItem.isRelevant, true))
      .orderBy(desc(petitionItem.fetchedAt))
      .limit(6);
  } catch (err) {
    if (!isMissingPetitionItemError(err)) {
      throw err;
    }
    return [];
  }
}

async function loadRelevantPressReleasesCompat(): Promise<PressRelease[]> {
  try {
    return await db
      .select()
      .from(pressRelease)
      .where(eq(pressRelease.isRelevant, true))
      .orderBy(desc(pressRelease.publishedAt), desc(pressRelease.fetchedAt))
      .limit(6);
  } catch (err) {
    if (!isMissingPressReleaseError(err)) {
      throw err;
    }
    return [];
  }
}

async function loadRecentTranscriptHitsCompat() {
  try {
    return await loadRecentTranscriptHits(6);
  } catch (err) {
    if (!isMissingTranscriptError(err)) {
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
    return await loadCachedImportance(input);
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

function isMissingPetitionItemError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("petition_item") &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("does not exist"))
  );
}

function isMissingPressReleaseError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("press_release") &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("does not exist"))
  );
}

function isMissingTranscriptError(err: unknown): boolean {
  const message = flattenErrorText(err);
  return (
    (message.includes("committee_transcript") ||
      message.includes("committee_transcript_utterance")) &&
    (message.includes("relation") ||
      message.includes("column") ||
      message.includes("42P01") ||
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

function PetitionRow({
  item,
}: {
  item: PetitionItem;
}) {
  return (
    <li className="border-b border-[var(--color-border)] py-[10px] last:border-b-0 last:pb-0 first:pt-0">
      <div className="mb-1 text-[12px] font-medium leading-snug text-[var(--color-text)]">
        {item.title}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
        {item.committee && <span className="font-semibold text-[var(--color-primary)]">{item.committee}</span>}
        {item.committee && item.proposerName && <span>·</span>}
        {item.proposerName && <span>{item.proposerName}</span>}
        {item.status && (
          <>
            {(item.committee || item.proposerName) && <span>·</span>}
            <span>{item.status}</span>
          </>
        )}
      </div>
    </li>
  );
}

function PressReleaseRow({
  item,
}: {
  item: PressRelease;
}) {
  const publishedDate = formatIsoDate(item.publishedAt);
  const body = (
    <>
      <div className="mb-1 flex items-start gap-1.5 text-[12px] font-medium leading-snug text-[var(--color-text)]">
        <span className="line-clamp-2 flex-1">{item.title}</span>
        {item.url && (
          <ExternalLink className="mt-[2px] h-3 w-3 shrink-0 text-[var(--color-text-tertiary)]" />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
        <span className="font-semibold text-[var(--color-primary)]">국회 공식</span>
        {publishedDate && <span>·</span>}
        {publishedDate && <span>{publishedDate}</span>}
      </div>
      {item.summary && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          {item.summary}
        </p>
      )}
    </>
  );

  return (
    <li className="border-b border-[var(--color-border)] py-[10px] last:border-b-0 last:pb-0 first:pt-0">
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block"
        >
          {body}
        </a>
      ) : (
        <div>{body}</div>
      )}
    </li>
  );
}

function TranscriptHitRow({
  item,
}: {
  item: Awaited<ReturnType<typeof loadRecentTranscriptHitsCompat>>[number];
}) {
  const meetingDate = formatIsoDate(item.meetingDate ? new Date(item.meetingDate) : null);
  const keywords = item.matchedKeywords.join(", ");
  const detailedSnippet =
    buildTranscriptSnippet(item.content, item.matchedKeywords, 180) ??
    item.snippet;
  const transcriptHref = `/transcripts/${item.minutesId}#utterance-${item.utteranceId}`;

  return (
    <li className="border-b border-[var(--color-border)] py-[10px] last:border-b-0 last:pb-0 first:pt-0">
      <a
        href={transcriptHref}
        className="group block rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--color-surface-2)]"
      >
        <div className="mb-1 flex items-start gap-2 text-[12px] font-medium leading-snug text-[var(--color-text)] group-hover:text-[var(--color-primary)]">
          <span className="line-clamp-2 flex-1">{item.meetingName}</span>
          <ExternalLink className="mt-[2px] h-3 w-3 shrink-0 text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
          {item.committee && (
            <span className="font-semibold text-[var(--color-primary)]">
              {item.committee}
            </span>
          )}
          {item.committee && meetingDate && <span>·</span>}
          {meetingDate && <span>{meetingDate}</span>}
          {(item.committee || meetingDate) && item.sessionLabel && <span>·</span>}
          {item.sessionLabel && <span>{item.sessionLabel}</span>}
          {(item.committee || meetingDate || item.sessionLabel) && item.place && <span>·</span>}
          {item.place && <span>{item.place}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)]">
          <span>
            {item.speakerName}
            {item.speakerRole ? ` ${item.speakerRole}` : ""}
          </span>
          {item.speakerArea && <span>· {item.speakerArea}</span>}
        </div>
        {keywords && (
          <div className="mt-2 text-[10px] font-semibold text-[var(--color-primary)]">
            키워드: {keywords}
          </div>
        )}
        {detailedSnippet && (
          <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
            {detailedSnippet}
          </p>
        )}
        <div className="mt-2 text-[10px] font-medium text-[var(--color-primary)]">
          해당 발언 자세히 보기
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
    <Link
      href={billHref(b.id)}
      className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] transition-colors hover:bg-[var(--color-surface-2)]"
    >
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
    </Link>
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
            : "bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]",
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
      ? "bg-[var(--color-info-soft)] text-[var(--color-info-text)]"
      : party === "국민의힘"
        ? "bg-[var(--color-error-soft)] text-[var(--color-error-text)]"
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

  return {
    contentJson: buildFallbackDailyBriefingContent({
      date,
      industryName,
      keyBills: topBills,
      scheduleItems: relevantNotices.slice(0, 3).map((notice) => ({
        date: notice.noticeEndDate ?? date,
        time: null,
        subject: notice.billName,
        committee: notice.committee,
        location: null,
      })),
      newBills: recentBills,
    }),
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
  return {
    contentJson: buildFallbackDailyBriefingContent({
      date,
      industryName,
      keyBills: getDemoTopBills(),
      scheduleItems: [],
      newBills: [],
    }),
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
  return {
    topBills: getDemoTopBills(),
    recentBills: getDemoRecentBills(),
    newsItems: getDemoNewsItems(),
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
