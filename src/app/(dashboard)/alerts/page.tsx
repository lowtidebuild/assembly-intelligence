import { Bell } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { AlertsPageClient } from "@/components/alerts-page-client";
import { loadRecentAlerts, loadUnreadAlertCount } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const [items, unreadCount] = await Promise.all([
    loadRecentAlerts(50),
    loadUnreadAlertCount(),
  ]);

  return (
    <>
      <PageHeader
        title="알림 센터"
        subtitle={`최근 알림 ${items.length}건 · 읽지 않음 ${unreadCount}건`}
      />

      <div className="mx-auto w-full max-w-[960px] p-6">
        <div className="mb-4 flex items-center gap-2 text-[13px] text-[var(--color-text-secondary)]">
          <Bell className="h-4 w-4" />
          morning/evening sync와 회의록·입법예고·청원·보도자료 변화가 이곳에 쌓입니다.
        </div>
        <AlertsPageClient initialAlerts={items} />
      </div>
    </>
  );
}
