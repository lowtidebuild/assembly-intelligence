/**
 * Dashboard layout — 240px sidebar + main column.
 *
 * Server component. Loads shared DashboardContext once and passes it
 * to the client DashboardShell, which manages the mobile sidebar.
 *
 * Pages inside this layout get the same grid wrapper, so each
 * page just renders its topbar + content area.
 */

import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardContext } from "@/lib/dashboard-data";
import { isDemoMode } from "@/lib/demo-mode";
import { unstable_noStore as noStore } from "next/cache";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemoMode()) {
    noStore();
  }

  const ctx = await getDashboardContext();

  return (
      <DashboardShell
        sidebarProps={{
          industryName: ctx.profile?.name,
          counts: {
            radarBills: ctx.counts.radarBills,
            watchedLegislators: ctx.counts.watchedLegislators,
        },
        lastSync: {
          timestamp: ctx.lastSync.timestamp ?? "동기화 기록 없음",
          status: ctx.lastSync.status,
        },
      }}
    >
      {children}
    </DashboardShell>
  );
}
