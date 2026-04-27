import type { BodyFetchStatus, EvidenceLevel, EvidenceMeta } from "@/lib/evidence";
import { cn } from "@/lib/utils";

const LEVEL_LABELS: Record<EvidenceLevel, string> = {
  title_only: "제목만",
  metadata: "메타데이터",
  body: "본문 기반",
  body_with_references: "본문+참고자료",
};

const STATUS_LABELS: Record<BodyFetchStatus, string> = {
  not_attempted: "미시도",
  from_mcp_detail: "MCP detail",
  from_existing_db: "기존 DB",
  fetched: "본문 확보",
  empty: "본문 없음",
  failed: "확보 실패",
};

const LEVEL_TONES: Record<EvidenceLevel, string> = {
  title_only:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200",
  metadata:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-200",
  body:
    "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-200",
  body_with_references:
    "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/40 dark:text-violet-200",
};

export function EvidenceBadge({
  level,
  status,
  compact = false,
}: {
  level: EvidenceLevel | null | undefined;
  status?: BodyFetchStatus | null;
  compact?: boolean;
}) {
  if (!level) {
    return (
      <span className="inline-flex rounded-[999px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-text-tertiary)]">
        근거 미기록
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[999px] border px-2 py-0.5 text-[10px] font-semibold",
        LEVEL_TONES[level],
      )}
    >
      {LEVEL_LABELS[level]}
      {!compact && status && (
        <span className="opacity-75">· {STATUS_LABELS[status]}</span>
      )}
    </span>
  );
}

export function EvidenceMetaList({ meta }: { meta: EvidenceMeta | null | undefined }) {
  if (!meta) return null;

  const available = meta.availableFields.length
    ? meta.availableFields.join(", ")
    : "none";
  const missing = meta.missingFields.length ? meta.missingFields.join(", ") : "none";

  return (
    <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-[11px] text-[var(--color-text-secondary)]">
      <div className="contents">
        <dt className="text-[var(--color-text-tertiary)]">확보</dt>
        <dd>{available}</dd>
      </div>
      <div className="contents">
        <dt className="text-[var(--color-text-tertiary)]">미확보</dt>
        <dd>{missing}</dd>
      </div>
      {meta.sourceNotes.length > 0 && (
        <div className="contents">
          <dt className="text-[var(--color-text-tertiary)]">출처</dt>
          <dd>{meta.sourceNotes.join(", ")}</dd>
        </div>
      )}
    </dl>
  );
}
