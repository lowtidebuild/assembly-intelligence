/**
 * PageHeader — sticky topbar for every dashboard page.
 *
 * Matches the ParlaWatch variant-C "topbar":
 *   [title] [date/sublabel]                 [search] [actions]
 *
 * Server component. Pages pass `title` + optional `subtitle` and
 * optional `actions` (e.g. a refresh button). Search is rendered as
 * a form GET against /radar for now — unified search can come later.
 */

import { Search } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
          {title}
        </h1>
        {subtitle && (
          <span className="border-l border-[var(--color-border)] pl-3 text-[13px] text-[var(--color-text-secondary)]">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex items-center gap-[10px]">
        <form action="/radar" method="GET" className="relative">
          <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            type="search"
            name="q"
            placeholder="법안, 의원, 키워드 검색..."
            className="w-[260px] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 pl-8 pr-3 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </form>
        {actions}
      </div>
    </div>
  );
}
