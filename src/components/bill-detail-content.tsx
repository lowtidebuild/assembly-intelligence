import type { Bill } from "@/db/schema";
import type React from "react";
import Link from "next/link";
import { StageBadge } from "@/components/stage-badge";
import { CompanyImpactEditor } from "@/components/company-impact-editor";
import { DetectionExplainability } from "@/components/detection-explainability";
import { EvidenceBadge, EvidenceMetaList } from "@/components/evidence-badge";
import { billImpactHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { BarChart3, ExternalLink } from "lucide-react";

export interface BillTimelineEntry {
  stage: Bill["stage"];
  eventDate: Date;
  description: string | null;
}

export function BillDetailContent({
  bill,
  timeline = [],
  variant = "panel",
}: {
  bill: Bill;
  timeline?: BillTimelineEntry[];
  variant?: "page" | "panel";
}) {
  const isPage = variant === "page";

  return (
    <div
      className={cn(
        "space-y-5",
        isPage && "grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:space-y-0",
      )}
    >
      <div className="space-y-5">
        <Facts bill={bill} variant={variant} />

        <Block label="AI 요약" sublabel="Gemini Flash">
          {bill.summaryText ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
              {bill.summaryText}
            </p>
          ) : (
            <EmptyNote>아직 요약이 생성되지 않았습니다.</EmptyNote>
          )}
        </Block>

        <Block label="중요도 판단" sublabel="Gemini 분석">
          {bill.relevanceReasoning ? (
            <p className="text-[13px] leading-relaxed text-[var(--color-text-secondary)]">
              {bill.relevanceReasoning}
            </p>
          ) : (
            <EmptyNote>판단 정보 없음</EmptyNote>
          )}
        </Block>

        {(bill.proposalReason || bill.mainContent) && (
          <Block label="제안이유 및 주요내용" sublabel="의안정보시스템 원문">
            {bill.proposalReason && (
              <>
                <h4 className="mb-1 text-[11px] font-bold text-[var(--color-text-tertiary)]">
                  제안이유
                </h4>
                <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
                  {bill.proposalReason}
                </p>
              </>
            )}
            {bill.mainContent && (
              <>
                <h4 className="mb-1 text-[11px] font-bold text-[var(--color-text-tertiary)]">
                  주요내용
                </h4>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-text)]">
                  {bill.mainContent}
                </p>
              </>
            )}
          </Block>
        )}

        <Block label="당사 영향 사항" sublabel="GR/PA 판단">
          <CompanyImpactEditor
            billId={bill.id}
            initialImpact={bill.companyImpact}
            initialIsAiDraft={bill.companyImpactIsAiDraft}
            compact={!isPage}
          />
        </Block>
      </div>

      <aside className="space-y-5">
        <Block label="근거 수준" sublabel="본문 확보 상태">
          <EvidenceBadge
            level={bill.evidenceLevel}
            status={bill.bodyFetchStatus}
          />
          <EvidenceMetaList meta={bill.evidenceMeta} />
        </Block>

        <Block label="탐지 이유" sublabel="탐지 메타데이터">
          <DetectionExplainability
            discoverySources={bill.discoverySources}
            discoveryKeywords={bill.discoveryKeywords}
            analysisMeta={bill.analysisMeta}
          />
        </Block>

        {timeline.length > 0 && (
          <Block label="진행 이력" sublabel="단계 변경">
            <ol className="space-y-2">
              {timeline.map((entry) => (
                <li
                  key={`${entry.stage}-${entry.eventDate.toISOString()}-${entry.description ?? ""}`}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StageBadge stage={entry.stage} />
                    <time className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                      {entry.eventDate.toISOString().slice(0, 10)}
                    </time>
                  </div>
                  {entry.description && (
                    <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                      {entry.description}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Block>
        )}

        <Block label="액션" sublabel="후속 검토">
          <div className="flex flex-wrap gap-2">
            <Link
              href={billImpactHref(bill.id)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              영향 분석
            </Link>
            {bill.externalLink && (
              <a
                href={bill.externalLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-light)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                의안정보시스템
              </a>
            )}
          </div>
        </Block>
      </aside>
    </div>
  );
}

function Facts({
  bill,
  variant,
}: {
  bill: Bill;
  variant: "page" | "panel";
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ["의안번호", bill.billNumber ?? bill.billId],
    ["소관위원회", bill.committee ?? "—"],
    ["현재 단계", <StageBadge key="s" stage={bill.stage} />],
    [
      "처리상태",
      bill.status ?? (
        <span className="text-[var(--color-text-tertiary)]">계류중</span>
      ),
    ],
  ];

  return (
    <dl
      className={cn(
        "grid gap-y-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-[12px]",
        variant === "page"
          ? "grid-cols-[120px_1fr] md:grid-cols-[120px_1fr_120px_1fr]"
          : "grid-cols-[100px_1fr]",
      )}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
          <dd className="min-w-0 text-[var(--color-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Block({
  label,
  sublabel,
  children,
}: {
  label: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 border-b border-[var(--color-border)] pb-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[var(--color-text)]">
          {label}
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
