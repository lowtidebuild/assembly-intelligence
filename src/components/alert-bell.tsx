"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAlertTimestamp,
  type AlertListItem,
} from "@/lib/alerts-ui";

interface AlertFeedResponse {
  unreadCount: number;
  items: AlertListItem[];
}

export function AlertBell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feed, setFeed] = useState<AlertFeedResponse>({
    unreadCount: 0,
    items: [],
  });

  useEffect(() => {
    void loadFeed();
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  async function loadFeed() {
    setLoading(true);
    try {
      const response = await fetch("/api/alerts?limit=6", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`alerts failed: ${response.status}`);
      }
      const payload = (await response.json()) as AlertFeedResponse;
      setFeed(payload);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    setSubmitting(true);
    try {
      const response = await fetch("/api/alerts/read-all", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`mark-all failed: ${response.status}`);
      }
      await loadFeed();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) return;
          void loadFeed();
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)]"
        aria-label="알림 열기"
      >
        <Bell className="h-4 w-4" />
        {feed.unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--color-error)] px-1.5 py-[2px] text-[10px] font-bold text-white">
            {feed.unreadCount > 9 ? "9+" : feed.unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-[340px] rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-overlay)] p-3 shadow-[var(--shadow-card-hover)] backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-[13px] font-bold text-[var(--color-text)]">
              알림
            </div>
            <span className="text-[11px] text-[var(--color-text-secondary)]">
              unread {feed.unreadCount}
            </span>
            <button
              type="button"
              disabled={submitting || feed.unreadCount === 0}
              onClick={() => void markAllRead()}
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
            >
              <CheckCheck className="h-3 w-3" />
              모두 읽음
            </button>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
              알림을 불러오는 중입니다...
            </p>
          ) : feed.items.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
              아직 알림이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {feed.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href ?? "/alerts"}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-[var(--radius-sm)] border px-3 py-2 transition-colors hover:bg-[var(--color-surface-2)]",
                    item.read
                      ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                      : "border-[var(--color-primary-light)] bg-[var(--color-primary-light)]/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 rounded-full",
                        item.severity === "critical"
                          ? "bg-[var(--color-error)]"
                          : item.severity === "warning"
                            ? "bg-[var(--color-warning)]"
                            : "bg-[var(--color-primary)]",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12px] font-semibold text-[var(--color-text)]">
                        {item.title}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
                        {item.message}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {item.meta && <span>{item.meta}</span>}
                        <span>{formatAlertTimestamp(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Link
            href="/alerts"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-center text-[12px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-surface-2)]"
          >
            알림 센터 열기
          </Link>
        </div>
      )}
    </div>
  );
}
