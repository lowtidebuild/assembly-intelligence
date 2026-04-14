"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "parlawatch-theme";
const THEME_EVENT = "parlawatch-theme-change";

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    readPreferredTheme,
    () => "light",
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`현재 ${theme === "dark" ? "다크" : "라이트"} 모드, 전환`}
      title={`${theme === "dark" ? "라이트" : "다크"} 모드로 전환`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-theme-toggle-bg)] text-[var(--color-theme-toggle-fg)] transition-colors hover:bg-[var(--color-surface-2)]"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function handleThemeChange() {
    onStoreChange();
  }

  window.addEventListener(THEME_EVENT, handleThemeChange);
  mediaQuery.addEventListener("change", handleThemeChange);

  return () => {
    window.removeEventListener(THEME_EVENT, handleThemeChange);
    mediaQuery.removeEventListener("change", handleThemeChange);
  };
}

function readPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}
