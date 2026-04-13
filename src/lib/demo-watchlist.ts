"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

export interface DemoWatchEntry {
  legislatorId: number;
  reason: string;
  addedAt: string;
}

const STORAGE_KEY = "parlawatch_demo_watchlist_v1";
const CHANGE_EVENT = "parlawatch:demo-watchlist-change";

function normalizeEntries(value: unknown): DemoWatchEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const legislatorId =
        typeof record.legislatorId === "number"
          ? record.legislatorId
          : Number.parseInt(String(record.legislatorId ?? ""), 10);
      if (!Number.isFinite(legislatorId)) return null;

      const reason =
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : "데모 워치";
      const addedAt =
        typeof record.addedAt === "string" && record.addedAt.trim()
          ? record.addedAt
          : new Date().toISOString();

      return {
        legislatorId,
        reason,
        addedAt,
      };
    })
    .filter((entry): entry is DemoWatchEntry => Boolean(entry))
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

export function readDemoWatchEntries(): DemoWatchEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeEntries(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeDemoWatchEntries(entries: DemoWatchEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function useDemoWatchlist(initialEntries: DemoWatchEntry[] = []) {
  const initialSnapshot = useMemo(
    () => normalizeEntries(initialEntries),
    [initialEntries],
  );
  const initialKey = useMemo(
    () => JSON.stringify(initialSnapshot),
    [initialSnapshot],
  );

  const entries = useSyncExternalStore(
    subscribe,
    () => {
      const stored = readDemoWatchEntries();
      return stored.length > 0 ? stored : initialSnapshot;
    },
    () => initialSnapshot,
  );

  useEffect(() => {
    const stored = readDemoWatchEntries();
    if (stored.length === 0 && initialSnapshot.length > 0) {
      writeDemoWatchEntries(initialSnapshot);
    }
  }, [initialKey, initialSnapshot]);

  const watchedIds = useMemo(
    () => new Set(entries.map((entry) => entry.legislatorId)),
    [entries],
  );

  function addEntry(legislatorId: number, reason: string) {
    writeDemoWatchEntries(
      normalizeEntries([
        {
          legislatorId,
          reason,
          addedAt: new Date().toISOString(),
        },
        ...entries.filter((entry) => entry.legislatorId !== legislatorId),
      ]),
    );
  }

  function removeEntry(legislatorId: number) {
    writeDemoWatchEntries(
      entries.filter((entry) => entry.legislatorId !== legislatorId),
    );
  }

  return {
    entries,
    watchedIds,
    isWatched: (legislatorId: number) => watchedIds.has(legislatorId),
    addEntry,
    removeEntry,
  };
}
