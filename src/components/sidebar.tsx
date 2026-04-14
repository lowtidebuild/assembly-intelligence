"use client";

/**
 * Sidebar — fixed 240px left rail, matches ParlaWatch variant-C mockup.
 *
 * Uses usePathname for active highlighting. The nav counts (e.g. "47"
 * next to 입법 레이더) are passed in from the server layout via props
 * since counts come from DB queries.
 *
 * The sync status footer is rendered as a separate client component
 * that polls /api/health periodically so the dot stays in sync with
 * the actual last_synced value. For now, static string from props.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileText,
  Radar,
  Users,
  UserSearch,
  TrendingUp,
  Landmark,
  MessagesSquare,
  Settings,
  Bell,
  LogOut,
  X,
} from "lucide-react";

export interface SidebarCounts {
  radarBills?: number;
  watchedLegislators?: number;
}

export interface SidebarProps {
  counts: SidebarCounts;
  /** Last sync summary shown in the footer */
  lastSync?: {
    timestamp: string; // "06:30 KST" or ISO
    status: "success" | "partial" | "failed" | "unknown";
  };
  /** Brand line (industry name appears as sub-label) */
  industryName?: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  section: "daily" | "tracking" | "system";
}

function buildItems(counts: SidebarCounts): NavItem[] {
  return [
    {
      section: "daily",
      href: "/briefing",
      label: "브리핑봇",
      icon: FileText,
    },
    {
      section: "tracking",
      href: "/radar",
      label: "입법 레이더",
      icon: Radar,
      badge: counts.radarBills,
    },
    {
      section: "tracking",
      href: "/watch",
      label: "의원 워치",
      icon: Users,
      badge: counts.watchedLegislators,
    },
    {
      section: "tracking",
      href: "/legislators",
      label: "의원 프로필",
      icon: UserSearch,
      badge: 295,
    },
    {
      section: "tracking",
      href: "/transcripts",
      label: "회의록",
      icon: MessagesSquare,
    },
    {
      section: "tracking",
      href: "/impact",
      label: "영향 분석기",
      icon: TrendingUp,
    },
    {
      section: "tracking",
      href: "/assembly",
      label: "국회 현황",
      icon: Landmark,
    },
    {
      section: "system",
      href: "/alerts",
      label: "알림",
      icon: Bell,
    },
    {
      section: "system",
      href: "/settings",
      label: "설정",
      icon: Settings,
    },
  ];
}

const sectionLabel: Record<NavItem["section"], string> = {
  daily: "Daily",
  tracking: "Tracking",
  system: "System",
};

export function Sidebar({
  counts,
  lastSync,
  industryName,
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const items = buildItems(counts);

  const grouped = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.section] ??= []).push(item);
    return acc;
  }, {});

  const syncDotClass =
    lastSync?.status === "success"
      ? "bg-[var(--color-success)] shadow-[0_0_0_3px_rgba(34,197,94,0.15)]"
      : lastSync?.status === "partial"
        ? "bg-[var(--color-warning)] shadow-[0_0_0_3px_rgba(245,158,11,0.15)]"
        : lastSync?.status === "failed"
          ? "bg-[var(--color-error)] shadow-[0_0_0_3px_rgba(239,68,68,0.15)]"
          : "bg-[var(--color-text-tertiary)]";

  const syncLabel =
    lastSync?.status === "success"
      ? "동기화 완료"
      : lastSync?.status === "partial"
        ? "부분 동기화"
        : lastSync?.status === "failed"
          ? "동기화 실패"
          : "동기화 대기";

  return (
    <>
      <button
        type="button"
        aria-label="메뉴 닫기"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] md:hidden",
          mobileOpen ? "block" : "hidden",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-[240px] flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-transform duration-200 md:sticky md:top-0 md:z-auto md:w-auto md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
      <div className="border-b border-[var(--color-border)] px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-[3px] text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-[var(--color-primary)]">
              ParlaWatch+
            </div>
            <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">
              {industryName ? `${industryName} 인텔리전스` : "산업별 국회 인텔리전스"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="사이드바 닫기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="flex-1 pb-4">
        {(["daily", "tracking", "system"] as const).map((section) => {
          const items = grouped[section];
          if (!items || items.length === 0) return null;
          return (
            <div key={section}>
              <div className="px-5 pb-[6px] pt-4 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
                {sectionLabel[section]}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname?.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => onClose?.()}
                    className={cn(
                      "relative flex items-center gap-[10px] px-5 py-[9px] text-[14px] font-medium transition-colors",
                      isActive
                        ? "bg-[var(--color-primary-light)] font-semibold text-[var(--color-primary)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]",
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-[2px] bg-[var(--color-primary)]" />
                    )}
                    <Icon className="h-[18px] w-[18px] opacity-85" />
                    <span>{item.label}</span>
                    {item.badge !== undefined && item.badge !== null && (
                      <span
                        className={cn(
                          "ml-auto rounded-[10px] px-[7px] py-[1px] text-[11px] font-semibold",
                          isActive
                            ? "bg-[var(--color-surface)] text-[var(--color-primary)]"
                            : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]",
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-[14px]">
        <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--color-text-secondary)]">
          <span
            className={cn("h-2 w-2 rounded-full", syncDotClass)}
            aria-hidden
          />
          <span>{syncLabel}</span>
        </div>
        {lastSync?.timestamp && (
          <div className="mb-3 ml-4 text-[11px] text-[var(--color-text-tertiary)]">
            {lastSync.timestamp}
          </div>
        )}
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-[10px] rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] font-medium text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
          >
            <LogOut className="h-[14px] w-[14px]" />
            로그아웃
          </button>
        </form>
      </div>
      </aside>
    </>
  );
}

// A minimal fallback for pages that render outside the server layout.
export function SidebarIcon({
  name,
}: {
  name: "feedback";
}) {
  if (name === "feedback") return <MessagesSquare className="h-[18px] w-[18px]" />;
  return null;
}
