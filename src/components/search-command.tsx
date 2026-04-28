"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { billHref } from "@/lib/routes";

interface SearchResponse {
  legislators: Array<{
    id: number;
    name: string;
    party: string;
    district: string | null;
  }>;
  bills: Array<{
    id?: number;
    billId: string;
    billNumber: string | null;
    billName: string;
    proposerName: string;
    committee: string | null;
    relevanceScore: number | null;
    stage: string | null;
    proposalDate: string | null;
    source: "local" | "mcp";
    tracked: boolean;
  }>;
}

type SearchItem =
  | {
      key: string;
      kind: "legislator";
      item: SearchResponse["legislators"][number];
    }
  | {
      kind: "bill";
      key: string;
      item: SearchResponse["bills"][number];
    };

const EMPTY_RESULTS: SearchResponse = {
  legislators: [],
  bills: [],
};

export function SearchCommand() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionPendingKey, setActionPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [results, setResults] = useState<SearchResponse>(EMPTY_RESULTS);

  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery.length < 2) {
      setLoading(false);
      setResults(EMPTY_RESULTS);
      setHighlightedIndex(-1);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setActionError(null);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(nextQuery)}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`search failed: ${response.status}`);
        }
        const payload = (await response.json()) as SearchResponse;
        setResults(payload);
        setHighlightedIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults(EMPTY_RESULTS);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: globalThis.MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const items = useMemo<SearchItem[]>(() => {
    const legislatorItems = results.legislators.map((entry) => ({
      key: `legislator-${entry.id}`,
      kind: "legislator" as const,
      item: entry,
    }));
    const billItems = results.bills.map((entry) => ({
      key: `bill-${entry.billId}`,
      kind: "bill" as const,
      item: entry,
    }));
    return [...legislatorItems, ...billItems];
  }, [results]);

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      setOpen(false);
      setHighlightedIndex(-1);
    });
  }

  async function monitorBill(entry: SearchResponse["bills"][number]) {
    if (entry.id && entry.tracked) {
      navigate(billHref(entry.id));
      return;
    }

    setActionError(null);
    setActionPendingKey(entry.billId);

    try {
      const response = await fetch("/api/bills/watch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billId: entry.billId,
          billNumber: entry.billNumber,
          billName: entry.billName,
          proposerName: entry.proposerName,
          committee: entry.committee,
          proposalDate: entry.proposalDate,
        }),
      });

      const payload = (await response.json()) as {
        id?: number;
        error?: { message?: string };
      };

      if (!response.ok || typeof payload.id !== "number") {
        throw new Error(
          payload.error?.message ?? "법안 모니터링 추가에 실패했습니다.",
        );
      }

      navigate(billHref(payload.id));
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "법안 모니터링 추가에 실패했습니다.",
      );
    } finally {
      setActionPendingKey(null);
    }
  }

  function activateItem(item: SearchItem) {
    if (item.kind === "legislator") {
      navigate(`/legislators/${item.item.id}`);
      return;
    }
    if (actionPendingKey === item.item.billId) {
      return;
    }
    if (item.item.id && item.item.tracked) {
      navigate(billHref(item.item.id));
      return;
    }
    void monitorBill(item.item);
  }

  function onSubmit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const highlighted = highlightedIndex >= 0 ? items[highlightedIndex] : null;
    if (highlighted) {
      activateItem(highlighted);
      return;
    }
    navigate(`/radar?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (items.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => (current + 1) % items.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (items.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) =>
        current <= 0 ? items.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  }

  const showDropdown = open && query.trim().length >= 2;
  const activeItemId =
    showDropdown && highlightedIndex >= 0 && items[highlightedIndex]
      ? `${listboxId}-${items[highlightedIndex].key}`
      : undefined;

  return (
    <div ref={rootRef} className="relative w-full md:w-[260px]">
      <Search className="pointer-events-none absolute left-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--color-text-secondary)]" />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="법안명, 의원명, 의안번호 검색..."
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={activeItemId}
        aria-busy={loading}
        className="w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] py-2 pl-8 pr-8 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
      />
      {loading && (
        <LoaderCircle className="absolute right-[10px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 animate-spin text-[var(--color-text-tertiary)]" />
      )}

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="통합 검색 결과"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card-hover)]"
        >
          {actionError && (
            <div className="border-b border-[var(--color-border)] bg-[var(--color-error-soft-2)] px-4 py-2 text-[11px] text-[var(--color-error-text)]">
              {actionError}
            </div>
          )}
          {loading ? (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
              검색 중...
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[var(--color-text-tertiary)]">
              검색 결과가 없습니다
            </div>
          ) : (
            <>
              {results.legislators.length > 0 && (
                <SectionLabel label={`의원 (${results.legislators.length}건)`} />
              )}
              {results.legislators.map((entry, index) => (
                <SearchOption
                  id={`${listboxId}-legislator-${entry.id}`}
                  key={`legislator-${entry.id}`}
                  active={highlightedIndex === index}
                  onSelect={() => navigate(`/legislators/${entry.id}`)}
                  title={entry.name}
                  meta={`${entry.party} · ${entry.district ?? "비례대표"}`}
                />
              ))}

              {results.bills.length > 0 && (
                <SectionLabel label={`법안 (${results.bills.length}건)`} />
              )}
              {results.bills.map((entry, index) => {
                const flatIndex = results.legislators.length + index;
                return (
                  <SearchOption
                    id={`${listboxId}-bill-${entry.billId}`}
                    key={`bill-${entry.billId}`}
                    active={highlightedIndex === flatIndex}
                    onSelect={() => {
                      if (actionPendingKey === entry.billId) return;
                      if (entry.id && entry.tracked) {
                        navigate(billHref(entry.id));
                        return;
                      }
                      void monitorBill(entry);
                    }}
                    title={entry.billName}
                    meta={formatBillMeta(entry)}
                    trailing={billTrailing(entry, {
                      pending: actionPendingKey === entry.billId,
                      onMonitor: () => void monitorBill(entry),
                    })}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatBillMeta(entry: SearchResponse["bills"][number]) {
  const parts = [
    entry.billNumber ? `의안번호 ${entry.billNumber}` : null,
    entry.proposerName,
    entry.committee,
  ].filter((value): value is string => Boolean(value));
  return parts.join(" · ");
}

function billTrailing(
  entry: SearchResponse["bills"][number],
  options: {
    pending: boolean;
    onMonitor: () => void;
  },
) {
  if (entry.id && entry.tracked) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <Badge classes="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]" label="모니터링 중" />
        {scoreBadge(entry.relevanceScore)}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Badge classes="bg-[var(--color-info-soft)] text-[var(--color-info-text)]" label="LIVE" />
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          options.onMonitor();
        }}
        disabled={options.pending}
        className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-[8px] py-[4px] text-[10px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.pending ? (
          <LoaderCircle className="h-3 w-3 animate-spin" />
        ) : null}
        <span>모니터링 추가</span>
      </button>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="border-t border-[var(--color-border)] px-4 py-2 text-[11px] font-semibold text-[var(--color-text-tertiary)] first:border-t-0">
      {label}
    </div>
  );
}

function SearchOption({
  id,
  active,
  onSelect,
  title,
  meta,
  trailing,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  title: string;
  meta: string;
  trailing?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      className={cn(
        "flex items-center gap-3 px-4 py-2 transition-colors",
        active
          ? "bg-[var(--color-primary-light)]"
          : "hover:bg-[var(--color-surface-2)]",
      )}
    >
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect();
        }}
        className="min-w-0 flex-1 text-left"
      >
        <div className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {title}
        </div>
        <div className="truncate text-[11px] text-[var(--color-text-secondary)]">
          {meta}
        </div>
      </button>
      {trailing}
    </div>
  );
}

function scoreBadge(score: number | null) {
  if (score === 5) {
    return <Badge classes="bg-[var(--color-error-soft)] text-[var(--color-error-text)]" label="S5" />;
  }
  if (score === 4) {
    return <Badge classes="bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]" label="A4" />;
  }
  if (score === 3) {
    return <Badge classes="bg-[var(--color-info-soft)] text-[var(--color-info-text)]" label="B3" />;
  }
  return null;
}

function Badge({
  classes,
  label,
}: {
  classes: string;
  label: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-[10px] px-[7px] py-[2px] text-[10px] font-bold ${classes}`}
    >
      {label}
    </span>
  );
}
