"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAlertTimestamp,
  type AlertListItem,
} from "@/lib/alerts-ui";

type FilterMode = "all" | "unread";

export function AlertsPageClient({
  initialAlerts,
}: {
  initialAlerts: AlertListItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<FilterMode>("all");
  const [alerts, setAlerts] = useState(initialAlerts);

  const unreadCount = alerts.filter((item) => !item.read).length;
  const filtered = useMemo(
    () => alerts.filter((item) => (mode === "unread" ? !item.read : true)),
    [alerts, mode],
  );

  async function markRead(id: number) {
    const response = await fetch("/api/alerts/read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return;
    setAlerts((current) =>
      current.map((item) => (item.id === id ? { ...item, read: true } : item)),
    );
    startTransition(() => router.refresh());
  }

  async function markAllRead() {
    const response = await fetch("/api/alerts/read-all", {
      method: "POST",
    });
    if (!response.ok) return;
    setAlerts((current) => current.map((item) => ({ ...item, read: true })));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("all")}
          className={cn(
            "rounded-[999px] px-3 py-1.5 text-[12px] font-semibold",
            mode === "all"
              ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]",
          )}
        >
          전체 {alerts.length}
        </button>
        <button
          type="button"
          onClick={() => setMode("unread")}
          className={cn(
            "rounded-[999px] px-3 py-1.5 text-[12px] font-semibold",
            mode === "unread"
              ? "bg-[var(--color-primary-light)] text-[var(--color-primary)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]",
          )}
        >
          읽지 않음 {unreadCount}
        </button>
        <button
          type="button"
          disabled={isPending || unreadCount === 0}
          onClick={() => void markAllRead()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          모두 읽음
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center text-[13px] text-[var(--color-text-tertiary)]">
          표시할 알림이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-4 shadow-[var(--shadow-card)]",
                item.read
                  ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                  : "border-[var(--color-primary-light)] bg-[var(--color-primary-light)]/35",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={cn(
                    "mt-1 h-2.5 w-2.5 rounded-full",
                    item.severity === "critical"
                      ? "bg-[var(--color-error)]"
                      : item.severity === "warning"
                        ? "bg-[var(--color-warning)]"
                        : "bg-[var(--color-primary)]",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[14px] font-bold text-[var(--color-text)]">
                      {item.title}
                    </h2>
                    {!item.read && (
                      <span className="rounded-[999px] bg-[var(--color-primary)] px-2 py-0.5 text-[10px] font-bold text-white">
                        NEW
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-text)]">
                    {item.message}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-tertiary)]">
                    {item.meta && <span>{item.meta}</span>}
                    <span>{formatAlertTimestamp(item.createdAt)}</span>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 gap-2">
                  {item.href && (
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-2)]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      바로가기
                    </Link>
                  )}
                  {!item.read && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => void markRead(item.id)}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                      읽음
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
