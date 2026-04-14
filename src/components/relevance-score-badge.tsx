/**
 * RelevanceScoreBadge — maps the 1-5 relevance score to the
 * GR/PA Excel's S/A/B/C label with color.
 *
 *   5 → S  (red)
 *   4 → A  (amber)
 *   3 → B  (blue)
 *   2 → B- (gray)
 *   1 → C  (gray)
 */

const MAP: Record<
  number,
  { label: string; classes: string; aria: string }
> = {
  5: {
    label: "S",
    classes: "bg-[var(--color-error-soft)] text-[var(--color-error-text)]",
    aria: "중요도 5 — 핵심",
  },
  4: {
    label: "A",
    classes: "bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]",
    aria: "중요도 4 — 주요",
  },
  3: {
    label: "B",
    classes: "bg-[var(--color-info-soft)] text-[var(--color-info-text)]",
    aria: "중요도 3 — 모니터링",
  },
  2: {
    label: "B-",
    classes: "bg-[var(--color-badge-neutral-bg)] text-[var(--color-badge-neutral-text)]",
    aria: "중요도 2 — 인접",
  },
  1: {
    label: "C",
    classes: "bg-[var(--color-badge-neutral-bg)] text-[var(--color-text-tertiary)]",
    aria: "중요도 1 — 무관",
  },
};

export function RelevanceScoreBadge({
  score,
  showNumber = true,
}: {
  score: number;
  showNumber?: boolean;
}) {
  const entry = MAP[score];
  if (!entry) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[10px] px-[7px] py-[2px] text-[10px] font-bold ${entry.classes}`}
      aria-label={entry.aria}
      title={entry.aria}
    >
      <span>{entry.label}</span>
      {showNumber && <span className="opacity-70">{score}</span>}
    </span>
  );
}
