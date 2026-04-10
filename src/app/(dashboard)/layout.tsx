/**
 * Dashboard layout — 240px sidebar + main column.
 *
 * Server component. Loads shared DashboardContext once (profile,
 * sidebar counts, last sync) and passes it to the client Sidebar.
 *
 * Pages inside this layout get the same grid wrapper, so each
 * page just renders its topbar + content area.
 */

import { Sidebar } from "@/components/sidebar";
import { getDashboardContext } from "@/lib/dashboard-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getDashboardContext();

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr] bg-[var(--color-bg)] text-[var(--color-text)]">
      <Sidebar
        industryName={ctx.profile?.name}
        counts={{
          radarBills: ctx.counts.radarBills,
          watchedLegislators: ctx.counts.watchedLegislators,
        }}
        lastSync={{
          timestamp: ctx.lastSync.timestamp ?? "동기화 기록 없음",
          status: ctx.lastSync.status,
        }}
      />
      <main className="flex min-w-0 flex-col">{children}</main>
    </div>
  );
}
