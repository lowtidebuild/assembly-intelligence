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
import { bill, dailyBriefing, industryProfile } from "@/db/schema";
import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { ContextStrip } from "@/components/context-strip";
import { BillKeyCard } from "@/components/bill-key-card";
import { todayKst, weekdayKo } from "@/lib/dashboard-data";
import { FileText, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic"; // always fresh DB reads

export default async function BriefingPage() {
  const [profileRows, latestBriefing, topBills, recentBills] =
    await Promise.all([
      db.select().from(industryProfile).limit(1),
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
      db.select().from(bill).orderBy(desc(bill.proposalDate)).limit(10),
    ]);

  const profile = profileRows[0];
  const briefing = latestBriefing[0];
  const today = todayKst();

  if (!profile) {
    return (
      <EmptyState
        title="프로필이 설정되지 않았습니다"
        message="설정 페이지에서 산업을 선택하고 키워드/위원회를 구성하세요."
        ctaLabel="설정으로 이동"
        ctaHref="/settings"
      />
    );
  }

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

      <div className="grid grid-cols-[1fr_360px] items-start gap-6 p-6">
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
                  />
                ))}
              </div>
            )}
          </Section>

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
        </aside>
      </div>
    </>
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
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-[14px] shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-border)] pb-[10px] text-[13px] font-bold text-[var(--color-text)]">
        {icon}
        {title}
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
