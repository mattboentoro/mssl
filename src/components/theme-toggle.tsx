"use client";

import { Moon, Sun } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { applyTheme, getTheme, subscribeTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const getServerSnapshot = (): Theme => "light";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerSnapshot);
  const [storageError, setStorageError] = useState(false);
  const isDark = theme === "dark";

  function toggle() {
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setStorageError(false);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (error) {
      console.warn("MSSL could not save the theme preference.", error);
      setStorageError(true);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label="Dark mode"
        aria-pressed={isDark}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="text-muted hover:text-foreground squircle inline-flex cursor-pointer items-center justify-center rounded-lg p-2"
      >
        {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
      </button>
      {storageError ? (
        <p
          role="status"
          className="bg-surface border-subtle squircle absolute top-full right-0 z-50 mt-2 w-60 rounded-xl border p-3 text-xs"
        >
          Theme changed for this page, but your browser could not save the preference.
        </p>
      ) : null}
    </div>
  );
}
