"use client";

/**
 * CompanyImpactEditor — client component for the "당사 영향 사항"
 * field. Used in both the impact page and the bill slide-over.
 *
 * Three states:
 *   1. empty        → show "AI 초안 생성" + "수동 편집" buttons
 *   2. viewing      → show the text, with "편집" and "AI 재생성" buttons
 *   3. editing      → show textarea + save/cancel buttons
 *
 * Actions:
 *   - "AI 초안 생성" → POST /api/bills/[id]/generate-impact
 *                      (slow ~20-30s, shows Gemini Pro spinner)
 *   - "저장"         → PATCH /api/bills/[id]/impact
 *                      (fast, clears AI draft flag on server)
 *
 * After every successful mutation we call router.refresh() to
 * re-fetch server state — avoids stale optimistic UI drift.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Edit3, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CompanyImpactEditorProps {
  billId: number;
  initialImpact: string | null;
  initialIsAiDraft: boolean;
  /** Compact variant (used in slide-over panel). */
  compact?: boolean;
}

type UiState = "view" | "edit";

export function CompanyImpactEditor({
  billId,
  initialImpact,
  initialIsAiDraft,
  compact = false,
}: CompanyImpactEditorProps) {
  const router = useRouter();
  const [impact, setImpact] = useState<string | null>(initialImpact);
  const [isAiDraft, setIsAiDraft] = useState<boolean>(initialIsAiDraft);
  const [draft, setDraft] = useState<string>(initialImpact ?? "");
  const [ui, setUi] = useState<UiState>("view");
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = (forceOverwrite = false) => {
    if (impact && !isAiDraft && !forceOverwrite) {
      const confirmed = window.confirm(
        "사람이 편집한 당사 영향 사항이 있습니다. AI 초안으로 덮어쓸까요?",
      );
      if (!confirmed) return;
      handleGenerate(true);
      return;
    }

    setError(null);
    startGenerate(async () => {
      try {
        const query = forceOverwrite ? "?force=1" : "";
        const res = await fetch(
          `/api/bills/${billId}/generate-impact${query}`,
          {
            method: "POST",
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          companyImpact: string;
          isAiDraft: boolean;
        };
        setImpact(data.companyImpact);
        setIsAiDraft(data.isAiDraft);
        setDraft(data.companyImpact);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleSave = () => {
    if (!draft.trim()) {
      setError("비어있을 수 없습니다.");
      return;
    }
    setError(null);
    startSave(async () => {
      try {
        const res = await fetch(`/api/bills/${billId}/impact`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyImpact: draft.trim() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          companyImpact: string;
          isAiDraft: boolean;
        };
        setImpact(data.companyImpact);
        setIsAiDraft(data.isAiDraft);
        setUi("view");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleCancelEdit = () => {
    setDraft(impact ?? "");
    setUi("view");
    setError(null);
  };

  const handleStartEdit = () => {
    setDraft(impact ?? "");
    setUi("edit");
    setError(null);
  };

  // ── RENDER ────────────────────────────────────────────────

  if (ui === "edit") {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={compact ? 5 : 7}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-[13px] leading-relaxed text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          placeholder="당사 영향 사항을 직접 입력하세요..."
          disabled={saving}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            저장
          </button>
          <button
            type="button"
            onClick={handleCancelEdit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
          >
            <X className="h-3 w-3" />
            취소
          </button>
          {error && (
            <span className="text-[11px] text-[var(--color-error)]">{error}</span>
          )}
        </div>
      </div>
    );
  }

  // ── View state ────────────────────────────────────────────

  return (
    <div>
      {impact ? (
        <>
          <p
            className={cn(
              "whitespace-pre-wrap leading-relaxed text-[var(--color-text)]",
              compact ? "text-[12px]" : "text-[13px]",
            )}
          >
            {impact}
          </p>
          {isAiDraft && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-warning-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--color-warning-text)]">
              <Sparkles className="h-3 w-3" />
              AI 초안 · 검토 필요
            </div>
          )}
        </>
      ) : (
        <p className="text-[12px] italic text-[var(--color-text-tertiary)]">
          아직 작성되지 않았습니다.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          title="Gemini Pro로 초안 생성 (20-30초 소요)"
        >
          {generating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              생성 중...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              {impact ? "AI 재생성" : "AI 초안 생성"}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleStartEdit}
          disabled={generating}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          <Edit3 className="h-3 w-3" />
          {impact ? "편집" : "수동 입력"}
        </button>
        {error && (
          <span className="text-[11px] text-[var(--color-error)]">{error}</span>
        )}
      </div>
    </div>
  );
}
