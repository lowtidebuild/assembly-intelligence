"use client";

/**
 * DeepAnalysisPanel — client component for the Gemini Pro 5-section
 * deep analysis on the impact page.
 *
 * States:
 *   1. no analysis yet → show "심층 분석 생성" button
 *   2. generating      → Pro thinking indicator (40-60s)
 *   3. has analysis    → render 5 sections + "재생성" button
 *   4. error           → show error + retry
 *
 * Analysis is persisted to bill.deep_analysis, so refresh of the
 * page keeps the cached version.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, TrendingUp, Target, Gauge } from "lucide-react";

/** Matches billAnalysisSchema in gemini-client.ts */
interface BillAnalysis {
  executive_summary: string;
  key_provisions: string[];
  impact_analysis: {
    operational: string;
    financial: string;
    compliance: string;
  };
  passage_likelihood: {
    assessment: string;
    reasoning: string;
  };
  recommended_actions: string[];
}

export interface DeepAnalysisPanelProps {
  billId: number;
  /** Parsed from bill.deep_analysis jsonb (unknown cast at page level) */
  initialAnalysis: unknown;
  initialGeneratedAt: Date | string | null;
}

function isValidAnalysis(value: unknown): value is BillAnalysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.executive_summary === "string" &&
    Array.isArray(v.key_provisions) &&
    typeof v.impact_analysis === "object" &&
    typeof v.passage_likelihood === "object" &&
    Array.isArray(v.recommended_actions)
  );
}

export function DeepAnalysisPanel({
  billId,
  initialAnalysis,
  initialGeneratedAt,
}: DeepAnalysisPanelProps) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<BillAnalysis | null>(
    isValidAnalysis(initialAnalysis) ? initialAnalysis : null,
  );
  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    initialGeneratedAt ? new Date(initialGeneratedAt) : null,
  );
  const [generating, startGenerate] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = () => {
    setError(null);
    startGenerate(async () => {
      try {
        const res = await fetch(`/api/bills/${billId}/analyze`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          analysis: unknown;
          generatedAt: string;
        };
        if (!isValidAnalysis(data.analysis)) {
          throw new Error("Gemini returned invalid analysis shape");
        }
        setAnalysis(data.analysis);
        setGeneratedAt(new Date(data.generatedAt));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  if (!analysis) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 text-center">
        <Sparkles className="mx-auto mb-2 h-8 w-8 text-[var(--color-text-tertiary)]" />
        <p className="mb-1 text-[13px] font-semibold text-[var(--color-text)]">
          아직 심층 분석이 생성되지 않았습니다
        </p>
        <p className="mb-4 text-[11px] text-[var(--color-text-secondary)]">
          Gemini Pro로 5개 섹션의 상세 분석을 생성합니다 (약 30-60초 소요)
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              생성 중... (40-60초)
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              심층 분석 생성
            </>
          )}
        </button>
        {error && (
          <p className="mt-3 text-[11px] text-[var(--color-error)]">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Meta + regenerate */}
      <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-tertiary)]">
        <span>
          {generatedAt && `생성일: ${generatedAt.toLocaleString("ko-KR")}`}
        </span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          재생성
        </button>
      </div>

      {/* Executive summary */}
      <Block title="Executive Summary" icon={<Target className="h-4 w-4" />}>
        <p className="text-[13px] leading-relaxed text-[var(--color-text)]">
          {analysis.executive_summary}
        </p>
      </Block>

      {/* Key provisions */}
      <Block title="핵심 조항" icon={<Sparkles className="h-4 w-4" />}>
        <ul className="space-y-2 text-[12px] text-[var(--color-text)]">
          {analysis.key_provisions.map((p, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--color-primary)]">
                #{i + 1}
              </span>
              <span className="leading-relaxed">{p}</span>
            </li>
          ))}
        </ul>
      </Block>

      {/* Impact analysis (3 axes) */}
      <Block title="영향 분석" icon={<TrendingUp className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ImpactAxis
            label="운영"
            color="border-l-[var(--color-info)]"
            text={analysis.impact_analysis.operational}
          />
          <ImpactAxis
            label="재무"
            color="border-l-[var(--color-warning)]"
            text={analysis.impact_analysis.financial}
          />
          <ImpactAxis
            label="컴플라이언스"
            color="border-l-[var(--color-error)]"
            text={analysis.impact_analysis.compliance}
          />
        </div>
      </Block>

      {/* Passage likelihood */}
      <Block title="통과 가능성" icon={<Gauge className="h-4 w-4" />}>
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
          <div className="mb-1.5 text-[14px] font-bold text-[var(--color-text)]">
            {analysis.passage_likelihood.assessment}
          </div>
          <p className="text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            {analysis.passage_likelihood.reasoning}
          </p>
        </div>
      </Block>

      {/* Recommended actions */}
      <Block title="권장 액션" icon={<Target className="h-4 w-4" />}>
        <ol className="space-y-2 text-[12px]">
          {analysis.recommended_actions.map((a, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <span className="leading-relaxed text-[var(--color-text)]">
                {a}
              </span>
            </li>
          ))}
        </ol>
      </Block>
    </div>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
        {icon}
        <h3 className="text-[13px] font-bold text-[var(--color-text)]">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function ImpactAxis({
  label,
  color,
  text,
}: {
  label: string;
  color: string;
  text: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-sm)] border border-[var(--color-border)] border-l-4 ${color} bg-[var(--color-surface)] px-3 py-2`}
    >
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
        {text}
      </p>
    </div>
  );
}
