import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { ExternalLink, X } from "lucide-react";
import { db } from "@/db";
import { bill, legislator } from "@/db/schema";
import {
  LegislatorImportanceStar,
} from "@/components/legislator-importance-star";
import type { ImportanceRecord } from "@/lib/legislator-importance";

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
  const initials = member.name.slice(0, 1);

  return (
    <>
      <Link
        href={closeHref}
        scroll={false}
        aria-label="닫기"
        className="fixed inset-0 z-20 bg-black/20 backdrop-blur-[1px]"
      />
      <aside className="fixed right-0 top-0 z-30 h-screen w-[500px] overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-[-4px_0_20px_rgba(0,0,0,0.08)]">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex flex-1 items-start gap-3 pr-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[15px] font-bold text-[var(--color-primary)]">
              {initials}
            </div>
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

          <Section title="주요 약력" sublabel="MEM_TITLE">
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
