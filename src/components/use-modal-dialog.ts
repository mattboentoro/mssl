"use client";

import { useCallback, useRef, type KeyboardEvent, type SyntheticEvent } from "react";

/** Native showModal supplies focus containment and an inert background. */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const invoker = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    invoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const initial = Array.from(
      dialog.querySelectorAll<HTMLElement>("[data-dialog-initial-focus]"),
    ).find((element) => element.closest("dialog") === dialog);
    initial?.focus();
  }, []);

  const restoreFocus = useCallback((event?: SyntheticEvent<HTMLDialogElement>) => {
    if (event && event.target !== event.currentTarget) return;
    const target = invoker.current;
    if (target?.isConnected && !target.matches(":disabled")) target.focus();
    else {
      const parent = ref.current?.parentElement?.closest("dialog[open]");
      (
        parent?.querySelector<HTMLElement>("button:not(:disabled)") ??
        document.getElementById("main")
      )?.focus();
    }
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget;
    if (
      event.key !== "Tab" ||
      !(event.target instanceof Element) ||
      event.target.closest("dialog") !== dialog
    )
      return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]',
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        element.closest("dialog") === dialog &&
        element.getClientRects().length > 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    // Explicit edge wrapping also prevents Tab from moving to browser chrome.
    if (
      !first ||
      (event.shiftKey && document.activeElement === first) ||
      (!event.shiftKey && document.activeElement === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
      if (!first) dialog.focus();
    }
  }, []);

  return { ref, open, restoreFocus, onKeyDown };
}
