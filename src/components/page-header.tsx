/**
 * PageHeader — sticky topbar for every dashboard page.
 *
 * Matches the ParlaWatch variant-C "topbar":
 *   [title] [date/sublabel]                 [search] [actions]
 *
 * Server component. Pages pass `title` + optional `subtitle` and
 * optional `actions` (e.g. a refresh button). Search is delegated to
 * the client-side SearchCommand.
 */

import { AlertBell } from "@/components/alert-bell";
import { SearchCommand } from "@/components/search-command";

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
    <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--color-text)]">
          {title}
        </h1>
        {subtitle && (
          <span className="border-l border-[var(--color-border)] pl-3 text-[13px] text-[var(--color-text-secondary)]">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex w-full items-center gap-[10px] md:w-auto">
        <AlertBell />
        <SearchCommand />
        {actions}
      </div>
    </div>
  );
}
