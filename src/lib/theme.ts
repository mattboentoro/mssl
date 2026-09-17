export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "mssl-theme";
export const THEME_READ_WARNING = "MSSL could not read the saved theme; using light mode.";

export function resolveTheme(value: string | null | undefined): Theme {
  return value === "dark" ? "dark" : "light";
}

export function getTheme(): Theme {
  return resolveTheme(document.documentElement.dataset.theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    if (event.storageArea !== window.localStorage) return;
    applyTheme(resolveTheme(event.newValue));
  }

  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

// Runs in the head before first paint; deliberately never reads the OS theme.
export const themeInitScript = `
(() => {
  let theme = "light";
  try {
    if (localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "dark") theme = "dark";
  } catch (error) {
    console.warn(${JSON.stringify(THEME_READ_WARNING)}, error);
  }
  document.documentElement.dataset.theme = theme;
})();
`;
