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

interface SearchResponse {
  legislators: Array<{
    id: number;
    name: string;
    party: string;
    district: string | null;
  }>;
  bills: Array<{
    id: number;
    billName: string;
    proposerName: string;
    committee: string | null;
    relevanceScore: number | null;
    stage: string;
  }>;
}

type SearchItem =
  | {
      key: string;
      href: string;
      kind: "legislator";
      title: string;
      meta: string;
      badge?: ReactNode;
    }
  | {
      key: string;
      href: string;
      kind: "bill";
      title: string;
      meta: string;
      badge?: ReactNode;
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
    function handlePointerDown(event: MouseEvent) {
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
      href: `/legislators/${entry.id}`,
      kind: "legislator" as const,
      title: entry.name,
      meta: `${entry.party} · ${entry.district ?? "비례대표"}`,
    }));
    const billItems = results.bills.map((entry) => ({
      key: `bill-${entry.id}`,
      href: `/radar?bill=${entry.id}`,
      kind: "bill" as const,
      title: entry.billName,
      meta: `${entry.proposerName}${entry.committee ? ` · ${entry.committee}` : ""}`,
      badge: scoreBadge(entry.relevanceScore),
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

  function onSubmit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const highlighted = highlightedIndex >= 0 ? items[highlightedIndex] : null;
    if (highlighted) {
      navigate(highlighted.href);
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
        placeholder="법안, 의원, 키워드 검색..."
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
                    id={`${listboxId}-bill-${entry.id}`}
                    key={`bill-${entry.id}`}
                    active={highlightedIndex === flatIndex}
                    onSelect={() => navigate(`/radar?bill=${entry.id}`)}
                    title={entry.billName}
                    meta={`${entry.proposerName}${entry.committee ? ` · ${entry.committee}` : ""}`}
                    badge={scoreBadge(entry.relevanceScore)}
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
  badge,
}: {
  id: string;
  active: boolean;
  onSelect: () => void;
  title: string;
  meta: string;
  badge?: ReactNode;
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      onMouseDown={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
        active
          ? "bg-[var(--color-primary-light)]"
          : "hover:bg-[var(--color-surface-2)]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-[var(--color-text)]">
          {title}
        </div>
        <div className="truncate text-[11px] text-[var(--color-text-secondary)]">
          {meta}
        </div>
      </div>
      {badge}
    </button>
  );
}

function scoreBadge(score: number | null) {
  if (score === 5) {
    return <Badge classes="bg-[#fee2e2] text-[#b91c1c]" label="S5" />;
  }
  if (score === 4) {
    return <Badge classes="bg-[#fef3c7] text-[#b45309]" label="A4" />;
  }
  if (score === 3) {
    return <Badge classes="bg-[#dbeafe] text-[#1d4ed8]" label="B3" />;
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
