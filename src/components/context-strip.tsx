/**
 * ContextStrip — thin horizontal bar under the topbar showing the
 * active industry + stat counts.
 *
 * Matches ParlaWatch variant-C "context-strip".
 * Only rendered on pages where stats make sense (briefing, radar).
 */

export interface ContextStripStat {
  label: string;
  value: number | string;
}

export function ContextStrip({
  industryName,
  tagline,
  stats,
}: {
  industryName: string;
  tagline?: string;
  stats?: ContextStripStat[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-[14px] border-b border-[var(--color-border)] bg-gradient-to-r from-[rgba(37,99,235,0.05)] to-transparent px-6 py-[10px] text-[12px] text-[var(--color-text-secondary)]">
      <span className="inline-flex items-center gap-[5px] rounded-[12px] bg-[var(--color-primary-light)] px-[10px] py-[3px] text-[11px] font-semibold text-[var(--color-primary)]">
        <span className="h-[5px] w-[5px] rounded-full bg-[var(--color-primary)]" />
        {industryName} 산업
      </span>
      {tagline && <span>{tagline}</span>}
      {stats && stats.length > 0 && (
        <div className="ml-auto flex gap-3 text-[11px]">
          {stats.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1">
              {i > 0 && <span>·</span>}
              <span className="text-[var(--color-text-secondary)]">{s.label}</span>
              <strong className="font-bold text-[var(--color-text)]">
                {s.value}
              </strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
