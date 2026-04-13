"use client";

import { Minus, Plus } from "lucide-react";
import { useDemoWatchlist, type DemoWatchEntry } from "@/lib/demo-watchlist";

export function DemoWatchToggleRow({
  legislatorId,
  profileName,
  defaultReason,
  initialEntries = [],
}: {
  legislatorId: number;
  profileName: string;
  defaultReason: string;
  initialEntries?: DemoWatchEntry[];
}) {
  const { isWatched, addEntry, removeEntry } = useDemoWatchlist(initialEntries);
  const watched = isWatched(legislatorId);

  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
          데모 워치리스트 · {profileName}
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--color-text-secondary)]">
          {watched
            ? "현재 이 브라우저의 데모 워치리스트에서 모니터링 중입니다."
            : "아직 이 브라우저의 데모 워치리스트에 없습니다."}
        </div>
      </div>
      {watched ? (
        <button
          type="button"
          onClick={() => removeEntry(legislatorId)}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <Minus className="h-3 w-3" />
          워치리스트에서 제거
        </button>
      ) : (
        <button
          type="button"
          onClick={() => addEntry(legislatorId, defaultReason)}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3 w-3" />
          워치리스트에 추가
        </button>
      )}
    </div>
  );
}

export function DemoWatchCardControls({
  legislatorId,
  defaultReason,
  initialEntries = [],
}: {
  legislatorId: number;
  defaultReason: string;
  initialEntries?: DemoWatchEntry[];
}) {
  const { isWatched, addEntry, removeEntry } = useDemoWatchlist(initialEntries);
  const watched = isWatched(legislatorId);

  return watched ? (
    <button
      type="button"
      onClick={() => removeEntry(legislatorId)}
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
    >
      <Minus className="h-3 w-3" />
      워치리스트에서 제거
    </button>
  ) : (
    <button
      type="button"
      onClick={() => addEntry(legislatorId, defaultReason)}
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Plus className="h-3 w-3" />
      워치리스트에 추가
    </button>
  );
}
