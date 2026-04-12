"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar, type SidebarProps } from "@/components/sidebar";

export function DashboardShell({
  children,
  sidebarProps,
}: {
  children: React.ReactNode;
  sidebarProps: SidebarProps;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <MobileHeader
        industryName={sidebarProps.industryName}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
        <Sidebar
          {...sidebarProps}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="flex min-w-0 flex-col">{children}</main>
      </div>
    </div>
  );
}

function MobileHeader({
  industryName,
  onMenuClick,
}: {
  industryName?: string;
  onMenuClick: () => void;
}) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="text-[16px] font-extrabold tracking-[-0.01em] text-[var(--color-primary)]">
            ParlaWatch+
          </div>
          <div className="truncate text-[10px] text-[var(--color-text-secondary)]">
            {industryName ? `${industryName} 인텔리전스` : "산업별 국회 인텔리전스"}
          </div>
        </div>
      </div>
    </div>
  );
}
