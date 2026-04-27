import {
  buildDetectionExplainability,
  type DetectionExplainabilityInput,
} from "@/lib/detection-explainability";
import { cn } from "@/lib/utils";

export function DetectionExplainability({
  discoverySources,
  discoveryKeywords,
  analysisMeta,
}: DetectionExplainabilityInput) {
  const explainability = buildDetectionExplainability({
    discoverySources,
    discoveryKeywords,
    analysisMeta,
  });

  if (!explainability.hasMetadata) {
    return (
      <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
        탐지 메타데이터 미기록
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {explainability.sources.length > 0 && (
        <div>
          <SectionLabel>발견 경로</SectionLabel>
          <ul className="space-y-1">
            {explainability.sources.map((source) => (
              <li
                key={source.label}
                className={cn(
                  "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--color-text-secondary)]",
                  source.inferred && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200",
                )}
              >
                {source.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {explainability.discoveryKeywords.length > 0 && (
        <KeywordGroup
          label="발견 키워드"
          tone="discovery"
          keywords={explainability.discoveryKeywords}
        />
      )}

      {explainability.analysisKeywords.length > 0 && (
        <KeywordGroup
          label="AI 판단 키워드"
          tone="analysis"
          keywords={explainability.analysisKeywords}
        />
      )}

      {explainability.unknowns.length > 0 && (
        <div className="rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100">
          <SectionLabel className="text-amber-800 dark:text-amber-200">
            확인 불가
          </SectionLabel>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {explainability.unknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        </div>
      )}

      {explainability.confidence && (
        <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
          <div className="contents">
            <dt className="text-[var(--color-text-tertiary)]">신뢰도</dt>
            <dd>{explainability.confidence}</dd>
          </div>
          {explainability.quickAnalysisVersion && (
            <div className="contents">
              <dt className="text-[var(--color-text-tertiary)]">분석 버전</dt>
              <dd>{explainability.quickAnalysisVersion}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function KeywordGroup({
  label,
  keywords,
  tone,
}: {
  label: string;
  keywords: string[];
  tone: "discovery" | "analysis";
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((keyword) => (
          <span
            key={keyword}
            className={cn(
              "inline-flex rounded-[999px] border px-2 py-0.5 text-[10px] font-semibold",
              tone === "discovery"
                ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-200"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200",
            )}
          >
            {keyword}
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1 text-[11px] font-bold text-[var(--color-text-tertiary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
