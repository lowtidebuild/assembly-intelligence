import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ExternalLink, Minus, Plus, X } from "lucide-react";
import { db } from "@/db";
import {
  bill,
  industryLegislatorWatch,
  industryProfile,
  legislator,
} from "@/db/schema";
import {
  LegislatorImportanceStar,
} from "@/components/legislator-importance-star";
import type { ImportanceRecord } from "@/lib/legislator-importance";
import {
  addLegislatorToWatchAction,
  removeLegislatorFromWatchAction,
} from "@/lib/watch-actions";
import { isDemoMode } from "@/lib/demo-mode";
import { DemoWatchToggleRow } from "@/components/demo-watch-controls";
import { LegislatorAvatar } from "@/components/legislator-avatar";

export async function LegislatorProfileSlideOver({
  legislatorId,
  closeHref,
  importance,
}: {
  legislatorId: number;
  closeHref: string;
  importance?: ImportanceRecord | null;
}) {
  const [member] = await db
    .select()
    .from(legislator)
    .where(eq(legislator.id, legislatorId))
    .limit(1);

  if (!member) return null;

  // Load active profile + check whether this legislator is in its watch list.
  const [profile] = await db
    .select({ id: industryProfile.id, name: industryProfile.name })
    .from(industryProfile)
    .limit(1);
  const watchRows = profile
    ? await db
        .select({ legislatorId: industryLegislatorWatch.legislatorId })
        .from(industryLegislatorWatch)
        .where(
          and(
            eq(industryLegislatorWatch.industryProfileId, profile.id),
            eq(industryLegislatorWatch.legislatorId, legislatorId),
          ),
        )
        .limit(1)
    : [];
  const isWatched = watchRows.length > 0;

  const sponsoredBills = await db
    .select({
      id: bill.id,
      billName: bill.billName,
      proposalDate: bill.proposalDate,
    })
    .from(bill)
    .where(
      and(
        eq(bill.proposerName, member.name),
        sql`(${bill.proposerParty} IS NULL OR ${bill.proposerParty} = ${member.party})`,
        sql`${bill.relevanceScore} >= 3`,
        sql`${bill.proposalDate} > NOW() - INTERVAL '180 days'`,
      ),
    )
    .orderBy(desc(bill.proposalDate))
    .limit(8);

  const committeeSummary = formatCommitteeSummary(
    member.committees ?? [],
    member.committeeRole,
  );
  const officeSummary = [member.officeAddress, member.officePhone]
    .filter(Boolean)
    .join(" · ");
  const staffSummary = formatStaff(member.staffRaw, member.secretaryRaw);
  const birthSummary = [member.birthDate, member.birthCalendar]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        aria-label="닫기"
          className="fixed inset-0 z-20 animate-[fadeIn_200ms_ease-out_both] bg-black/20 backdrop-blur-[1px]"
      />
      <aside className="fixed right-0 top-0 z-30 h-screen w-full animate-[slideInRight_250ms_cubic-bezier(0.16,1,0.3,1)_both] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)] md:w-[500px]">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex flex-1 items-start gap-3 pr-4">
            <LegislatorAvatar
              name={member.name}
              photoUrl={member.photoUrl}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold leading-snug text-[var(--color-text)]">
                  {member.name}
                </h2>
                {member.nameHanja && (
                  <span className="text-[12px] text-[var(--color-text-tertiary)]">
                    {member.nameHanja}
                  </span>
                )}
                <LegislatorImportanceStar
                  level={importance?.level ?? null}
                  size={14}
                  reasons={importance?.reasons}
                />
              </div>
              <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                {member.party}
                {member.district && ` · ${member.district}`}
                {member.electionType && ` · ${member.electionType}`}
                {member.termNumber && ` · ${member.termNumber}선`}
              </div>
              <Link
                href={`/legislators/${legislatorId}`}
                className="mt-1 inline-flex text-[11px] text-[var(--color-primary)] hover:underline"
              >
                상세 페이지로 이동 →
              </Link>
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

        {profile &&
          (isDemoMode() ? (
            <DemoWatchToggleRow
              legislatorId={legislatorId}
              profileName={profile.name}
              defaultReason={buildDefaultReason(importance, member.name)}
              initialEntries={
                isWatched
                  ? [
                      {
                        legislatorId,
                        reason: buildDefaultReason(importance, member.name),
                        addedAt: new Date().toISOString(),
                      },
                    ]
                  : []
              }
            />
          ) : (
            <WatchToggleRow
              legislatorId={legislatorId}
              isWatched={isWatched}
              profileName={profile.name}
              defaultReason={buildDefaultReason(importance, member.name)}
            />
          ))}

        <div className="space-y-5 px-5 py-5">
          <FactsGrid
            rows={[
              ["위원회", committeeSummary || "—"],
              ["역대", member.termHistory ?? "—"],
              ["생년월일", birthSummary || "—"],
              ["성별", member.gender ?? "—"],
              ["이메일", member.email ?? "—"],
              [
                "홈페이지",
                member.homepage ? (
                  <a
                    href={member.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                  >
                    열기
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "—"
                ),
              ],
              ["사무실", officeSummary || "—"],
              ["보좌진", staffSummary || "—"],
            ]}
          />

          <Section title="주요 약력">
            {member.memTitle ? (
              <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-[var(--color-text)]">
                {member.memTitle}
              </pre>
            ) : (
              <EmptyNote>아직 저장된 약력이 없습니다.</EmptyNote>
            )}
          </Section>

          <Section
            title="관련 활동"
            sublabel={`산업 관련 법안 대표발의 ${sponsoredBills.length}건`}
          >
            {sponsoredBills.length === 0 ? (
              <EmptyNote>최근 180일 내 산업 관련 대표발의 법안이 없습니다.</EmptyNote>
            ) : (
              <ul className="space-y-2">
                {sponsoredBills.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                  >
                    <Link
                      href={`/radar?bill=${entry.id}`}
                      className="block text-[12px] font-medium text-[var(--color-text)] hover:text-[var(--color-primary)]"
                    >
                      {entry.billName}
                    </Link>
                    {entry.proposalDate && (
                      <div className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {entry.proposalDate.toISOString().slice(0, 10)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="중요도 표시 이유" sublabel="산업 프로필 기준">
            {importance?.reasons && importance.reasons.length > 0 ? (
              <ul className="space-y-1 text-[12px] text-[var(--color-text-secondary)]">
                {importance.reasons.map((reason) => (
                  <li key={reason}>• {reason}</li>
                ))}
              </ul>
            ) : (
              <EmptyNote>현재 프로필 기준의 중요도 이유가 없습니다.</EmptyNote>
            )}
          </Section>
        </div>
      </aside>
    </>
  );
}

function FactsGrid({
  rows,
}: {
  rows: Array<[string, React.ReactNode]>;
}) {
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

function Section({
  title,
  sublabel,
  children,
}: {
  title: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 border-b border-[var(--color-border)] pb-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text)]">
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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}

function formatCommitteeSummary(
  committees: string[],
  committeeRole: string | null,
): string {
  if (committees.length === 0) return "";
  if (!committeeRole || committeeRole === "위원") {
    return committees.join(", ");
  }
  const [first, ...rest] = committees;
  return [`${first} (${committeeRole})`, ...rest].join(", ");
}

function formatStaff(
  staffRaw: string | null,
  secretaryRaw: string | null,
): string {
  const parts = [];
  if (staffRaw) parts.push(`보좌진: ${staffRaw}`);
  if (secretaryRaw) parts.push(`비서관: ${secretaryRaw}`);
  return parts.join(" · ");
}

function buildDefaultReason(
  importance: ImportanceRecord | null | undefined,
  name: string,
): string {
  if (importance?.reasons && importance.reasons.length > 0) {
    return importance.reasons.join(" · ");
  }
  return `${name} 수동 추가`;
}

function WatchToggleRow({
  legislatorId,
  isWatched,
  profileName,
  defaultReason,
}: {
  legislatorId: number;
  isWatched: boolean;
  profileName: string;
  defaultReason: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          워치리스트 · {profileName}
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
          {isWatched
            ? "현재 워치리스트에서 모니터링 중입니다."
            : "아직 워치리스트에 없습니다."}
        </div>
      </div>
      {isWatched ? (
        <form action={removeLegislatorFromWatchAction}>
          <input type="hidden" name="legislatorId" value={legislatorId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <Minus className="h-3 w-3" />
            워치리스트에서 제거
          </button>
        </form>
      ) : (
        <form action={addLegislatorToWatchAction}>
          <input type="hidden" name="legislatorId" value={legislatorId} />
          <input type="hidden" name="reason" value={defaultReason} />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            워치리스트에 추가
          </button>
        </form>
      )}
    </div>
  );
}
