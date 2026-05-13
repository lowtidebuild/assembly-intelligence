import type React from "react";
import type { AmendmentDelta } from "@/lib/amendment-delta";
import { hasUsefulAmendmentDelta } from "@/lib/amendment-delta";
import { cn } from "@/lib/utils";

const SOURCE_LABELS: Record<AmendmentDelta["source"], string> = {
  proposal_reason: "제안이유",
  main_content: "주요내용",
  attachment: "첨부문서",
  manual: "수동입력",
};

const CONFIDENCE_LABELS: Record<AmendmentDelta["confidence"], string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
};

export function AmendmentDeltaSummary({
  delta,
}: {
  delta: AmendmentDelta | null | undefined;
}) {
  if (!hasUsefulAmendmentDelta(delta)) {
    return <EmptyNote>이번 개정으로 바뀌는 조문을 추출하지 못했습니다.</EmptyNote>;
  }

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{SOURCE_LABELS[delta.source]}</Badge>
        <Badge>신뢰도 {CONFIDENCE_LABELS[delta.confidence]}</Badge>
        {delta.changeTypes.map((type) => (
          <Badge key={type} tone="accent">
            {type}
          </Badge>
        ))}
      </div>

      <List title="핵심 변경" items={delta.keyChanges} ordered />

      {delta.affectedArticles.length > 0 && (
        <InlineGroup title="영향 조문" items={delta.affectedArticles} />
      )}

      {delta.affectedParties.length > 0 && (
        <InlineGroup title="영향 주체" items={delta.affectedParties} />
      )}
    </div>
  );
}

export function AmendmentDeltaImpact({
  delta,
}: {
  delta: AmendmentDelta | null | undefined;
}) {
  if (!hasUsefulAmendmentDelta(delta)) {
    return <EmptyNote>실무 영향 추출을 위해 제안이유/주요내용 확보가 필요합니다.</EmptyNote>;
  }

  const hasImpacts =
    delta.operationalImpacts.length > 0 ||
    delta.complianceImpacts.length > 0 ||
    delta.financialImpacts.length > 0;

  return (
    <div className="space-y-3 text-[13px]">
      {hasImpacts ? (
        <div className="grid gap-3 md:grid-cols-3">
          <List title="운영" items={delta.operationalImpacts} />
          <List title="준법" items={delta.complianceImpacts} />
          <List title="비용/지원" items={delta.financialImpacts} />
        </div>
      ) : (
        <EmptyNote>원문만으로 직접적인 실무 영향을 분류하기 어렵습니다.</EmptyNote>
      )}

      {delta.unknowns.length > 0 && (
        <List title="확인 필요" items={delta.unknowns} tone="muted" />
      )}
    </div>
  );
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium",
        tone === "accent"
          ? "border-[var(--color-primary)]/25 bg-[var(--color-primary-light)] text-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]",
      )}
    >
      {children}
    </span>
  );
}

function InlineGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1">
      <h4 className="text-[11px] font-bold text-[var(--color-text-tertiary)]">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] px-2 py-1 text-[12px] text-[var(--color-text-secondary)]"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function List({
  title,
  items,
  ordered = false,
  tone = "default",
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  tone?: "default" | "muted";
}) {
  if (items.length === 0) {
    return (
      <div>
        <h4 className="mb-1 text-[11px] font-bold text-[var(--color-text-tertiary)]">
          {title}
        </h4>
        <EmptyNote>해당 사항 없음</EmptyNote>
      </div>
    );
  }

  const ListTag = ordered ? "ol" : "ul";

  return (
    <div>
      <h4 className="mb-1 text-[11px] font-bold text-[var(--color-text-tertiary)]">
        {title}
      </h4>
      <ListTag
        className={cn(
          "space-y-1.5 leading-relaxed",
          ordered ? "list-decimal pl-4" : "list-disc pl-4",
          tone === "muted"
            ? "text-[var(--color-text-tertiary)]"
            : "text-[var(--color-text)]",
        )}
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
      {children}
    </p>
  );
}
