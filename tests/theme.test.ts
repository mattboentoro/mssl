import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  getTheme,
  resolveTheme,
  subscribeTheme,
  themeInitScript,
  THEME_READ_WARNING,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

afterEach(() => vi.unstubAllGlobals());

describe("explicit theme preference", () => {
  it.each([
    ["dark", "dark"],
    ["light", "light"],
    [null, "light"],
    [undefined, "light"],
    ["", "light"],
    ["system", "light"],
    ["DARK", "light"],
  ] as const)("resolves %s to %s", (stored, expected) => {
    expect(resolveTheme(stored)).toBe(expected);
  });

  it.each([
    { stored: null, expected: "light" },
    { stored: "dark", expected: "dark" },
    { stored: "light", expected: "light" },
    { stored: "invalid", expected: "light" },
  ])("initializes $stored before hydration, ignoring a dark OS setting", ({ stored, expected }) => {
    const root = { dataset: { theme: "light" } };
    const getItem = vi.fn(() => stored);
    const matchMedia = vi.fn(() => ({ matches: true }));
    runInNewContext(themeInitScript, {
      document: { documentElement: root },
      localStorage: { getItem },
      window: { matchMedia },
      console: { warn: vi.fn() },
    });
    expect(root.dataset.theme).toBe(expected);
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(matchMedia).not.toHaveBeenCalled();
  });

  it("uses light and reports an unreadable stored preference", () => {
    const root = { dataset: { theme: "dark" } };
    const error = new Error("Storage is blocked");
    const warn = vi.fn();
    runInNewContext(themeInitScript, {
      document: { documentElement: root },
      get localStorage() {
        throw error;
      },
      console: { warn },
    });
    expect(root.dataset.theme).toBe("light");
    expect(warn).toHaveBeenCalledWith(THEME_READ_WARNING, error);
  });

  it("reads and changes the shared theme without requiring storage access", () => {
    const root = { dataset: { theme: "light" } };
    vi.stubGlobal("document", { documentElement: root });
    expect(getTheme()).toBe("light");
    applyTheme("dark");
    expect(getTheme()).toBe("dark");
    applyTheme("light");
    expect(getTheme()).toBe("light");
  });

  it("syncs only the local-storage preference and cleans up its listeners", () => {
    const root = { dataset: { theme: "light" } };
    const localStorage = {};
    const sessionStorage = {};
    const events = new EventTarget();
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notify = () => {};
    vi.stubGlobal("document", { documentElement: root });
    vi.stubGlobal("window", {
      localStorage,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    });
    vi.stubGlobal(
      "MutationObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const onChange = vi.fn();
    const unsubscribe = subscribeTheme(onChange);
    expect(observe).toHaveBeenCalledWith(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    notify();
    expect(onChange).toHaveBeenCalledOnce();

    function change(key: string | null, newValue: string | null, storageArea = localStorage) {
      events.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea }));
    }
    change("unrelated", "dark");
    expect(getTheme()).toBe("light");
    change(THEME_STORAGE_KEY, "dark", sessionStorage);
    expect(getTheme()).toBe("light");
    change(THEME_STORAGE_KEY, "dark");
    expect(getTheme()).toBe("dark");
    change(THEME_STORAGE_KEY, "light");
    expect(getTheme()).toBe("light");
    change(THEME_STORAGE_KEY, "dark");
    change(null, null);
    expect(getTheme()).toBe("light");
    change(THEME_STORAGE_KEY, "dark");
    change(THEME_STORAGE_KEY, "invalid");
    expect(getTheme()).toBe("light");
    unsubscribe();
    expect(disconnect).toHaveBeenCalledOnce();
    change(THEME_STORAGE_KEY, "dark");
    expect(getTheme()).toBe("light");
  });
});

describe("dark palette legibility", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const dark = css.match(/html\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1];
  if (!dark) throw new Error("Missing dark theme palette");
  const tokens = new Map(
    [...dark.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map((m) => [m[1], m[2]]),
  );
  const color = (token: string) => {
    const value = tokens.get(token);
    if (!value) throw new Error(`Missing dark token: ${token}`);
    return value;
  };
  function luminance(hex: string) {
    const channel = (offset: number) => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
  }
  function contrast(a: string, b: string) {
    const first = luminance(a);
    const second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }
  function blend(foreground: string, background: string, opacity: number) {
    return (
      "#" +
      [1, 3, 5]
        .map((offset) => {
          const front = Number.parseInt(foreground.slice(offset, offset + 2), 16);
          const back = Number.parseInt(background.slice(offset, offset + 2), 16);
          return Math.round(front * opacity + back * (1 - opacity))
            .toString(16)
            .padStart(2, "0");
        })
        .join("")
    );
  }

  it.each(["foreground", "muted", "brand", "accent", "danger", "warning", "success"])(
    "keeps %s text at WCAG AA contrast on page and card surfaces",
    (token) => {
      for (const surface of ["background", "surface", "surface-muted"]) {
        expect(
          contrast(color(token), color(surface)),
          `${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(["brand", "accent", "danger", "warning", "success"])(
    "keeps %s badges legible over their tinted fill",
    (token) => {
      const fill = blend(color(token), color("surface-muted"), 0.1);
      expect(contrast(color(token), fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ["brand-contrast", "brand"],
    ["brand-contrast", "brand-strong"],
    ["status-contrast", "danger"],
    ["status-contrast", "success"],
  ])("keeps filled %s / %s controls legible", (text, background) => {
    expect(contrast(color(text), color(background))).toBeGreaterThanOrEqual(4.5);
  });
});
