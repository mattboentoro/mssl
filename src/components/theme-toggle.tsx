"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "mssl-theme";

/**
 * Subscribe to the `dark` class on <html>. That class is the single source of
 * truth: an inline script in the root layout sets it before first paint, so
 * there is no flash and no state to duplicate inside React.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

/** During SSR and hydration we assume light; React re-renders once hydrated. */
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private mode / storage disabled — the toggle still works for this page.
    }
  }, []);

  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={label}
      title={label}
      className="hover:bg-surface-muted border-subtle inline-flex h-9 w-9 items-center justify-center rounded-lg border text-base"
    >
      <span aria-hidden>{isDark ? "\u2600\ufe0f" : "\ud83c\udf19"}</span>
    </button>
  );
}

/** Runs before paint so the stored theme does not flash. */
export const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;
