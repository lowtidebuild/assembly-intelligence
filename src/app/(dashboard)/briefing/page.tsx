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
 * bills and generated the briefing HTML, so this page is just a
 * layout shell around pre-computed data.
 */

import { db } from "@/db";
import {
  bill,
  dailyBriefing,
  industryCommittee,
  industryProfile,
  legislationNotice,
  type LegislationNotice,
} from "@/db/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { BillKeyCard } from "@/components/bill-key-card";
import { LegislatorProfileSlideOver } from "@/components/legislator-profile-slide-over";
import { todayKst, weekdayKo } from "@/lib/dashboard-data";
import {
  computeImportance,
  loadProposerImportanceMap,
  makeProposerKey,
} from "@/lib/legislator-importance";
import { loadRecentNews } from "@/services/news-sync";
import { cn } from "@/lib/utils";
import { FileText, RefreshCw, Newspaper, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic"; // always fresh DB reads

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

  const [latestBriefing, topBills, relevantNotices, recentBills, newsItems, importanceById] =
    await Promise.all([
      db
        .select()
        .from(dailyBriefing)
        .orderBy(desc(dailyBriefing.date))
        .limit(1),
      db
        .select()
        .from(bill)
        .orderBy(desc(bill.relevanceScore), desc(bill.proposalDate))
        .limit(4),
      db
        .select()
        .from(legislationNotice)
        .where(
          and(
            eq(legislationNotice.isRelevant, true),
            sql`${legislationNotice.noticeEndDate} >= CURRENT_DATE`,
          ),
        )
        .orderBy(asc(legislationNotice.noticeEndDate))
        .limit(10),
      db.select().from(bill).orderBy(desc(bill.proposalDate)).limit(10),
      loadRecentNews(8),
      computeImportance({
        profileId: profile.id,
        committeeCodes: committees.map((c) => c.committeeCode),
      }),
    ]);

  const briefing = latestBriefing[0];
  const proposerImportance = await loadProposerImportanceMap(
    topBills.map((entry) => ({
      name: entry.proposerName,
      party: entry.proposerParty,
    })),
    importanceById,
  );

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
          { label: "핵심", value: topBills.length },
          { label: "일정", value: briefing?.scheduleCount ?? 0 },
          { label: "신규", value: briefing?.newBillCount ?? 0 },
          { label: "전체", value: recentBills.length },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-6 p-6 lg:grid-cols-[1fr_360px]">
        {/* LEFT COLUMN */}
        <div className="min-w-0">
          <Section title="오늘의 핵심" sublabel="Gemini 평가" count={topBills.length}>
            {topBills.length === 0 ? (
              <SectionEmpty message="오늘 올릴 핵심 법안이 없습니다. 아직 아침 동기화가 돌지 않았을 수 있어요." />
            ) : (
              <div className="flex flex-col gap-[10px]">
                {topBills.map((b, i) => (
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

          {relevantNotices.length > 0 && (
            <Section
              title="입법예고"
              sublabel="의견제출 마감일 기준"
              count={relevantNotices.length}
            >
              <div className="flex flex-col gap-[6px]">
                {relevantNotices.map((notice) => (
                  <LegislationNoticeRow key={notice.id} notice={notice} />
                ))}
              </div>
            </Section>
          )}

          <Section title="신규 발의" count={recentBills.length}>
            {recentBills.length === 0 ? (
              <SectionEmpty message="최근 24시간 신규 발의 없음." />
            ) : (
              <div className="flex flex-col gap-[6px]">
                {recentBills.map((b) => (
                  <NewBillRow key={b.id} bill={b} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <aside className="flex flex-col gap-4">
          <SideSection title="Gemini 브리핑" icon={<FileText className="h-4 w-4" />}>
            {briefing ? (
              <GeminiBriefingHtml html={briefing.contentHtml} />
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
            {newsItems.length === 0 ? (
              <p className="text-[12px] text-[var(--color-text-tertiary)]">
                아직 수집된 뉴스가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col">
                {newsItems.map((n) => (
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
          {item.source && item.publishedAt && <span>·</span>}
          {item.publishedAt && (
            <span>
              {item.publishedAt.toISOString().slice(0, 10).replaceAll("-", ".")}
            </span>
          )}
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
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px]">
      {b.proposalDate && (
        <span className="shrink-0 rounded-[4px] bg-[var(--color-surface-2)] px-[7px] py-[2px] font-mono text-[11px] font-semibold text-[var(--color-text-secondary)]">
          {b.proposalDate.toISOString().slice(5, 10)}
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
