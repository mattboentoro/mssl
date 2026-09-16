"use client";

import { useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/components/ui";

type PendingNavigation = { type: "back" } | { type: "link"; href: string };

/**
 * Blocks navigation while a form has unsaved edits.
 *
 * Same-document Back and link navigation use the site's modal. Browsers require
 * their own non-customisable prompt for reload, tab close, and cross-document
 * navigation, so `beforeunload` remains as the final safety net.
 */
export function UnsavedChangesGuard({ enabled }: { enabled: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const enabledRef = useRef(enabled);
  const guardEntryActive = useRef(false);
  const suppressNextPop = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;

    if (enabled && !guardEntryActive.current) {
      window.history.pushState(
        { ...window.history.state, __msslUnsavedChangesGuard: true },
        "",
        window.location.href,
      );
      guardEntryActive.current = true;
    }

    if (!enabled && guardEntryActive.current) {
      suppressNextPop.current = true;
      guardEntryActive.current = false;
      window.history.back();
    }
  }, [enabled]);

  useEffect(() => {
    const showWarning = (navigation: PendingNavigation) => {
      setPendingNavigation(navigation);
      dialogRef.current?.showModal();
    };

    const onPopState = () => {
      if (suppressNextPop.current) {
        suppressNextPop.current = false;
        return;
      }
      if (!enabledRef.current || !guardEntryActive.current) return;

      window.history.pushState(
        { ...window.history.state, __msslUnsavedChangesGuard: true },
        "",
        window.location.href,
      );
      showWarning({ type: "back" });
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (!enabledRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.download) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();
      showWarning({ type: "link", href: destination.href });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const stay = () => {
    setPendingNavigation(null);
    dialogRef.current?.close();
  };

  const leave = () => {
    if (!pendingNavigation) return;
    enabledRef.current = false;
    dialogRef.current?.close();

    if (pendingNavigation.type === "link") {
      window.location.assign(pendingNavigation.href);
      return;
    }

    guardEntryActive.current = false;
    window.history.go(-2);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) stay();
      }}
      onCancel={(event) => {
        event.preventDefault();
        stay();
      }}
      className="bg-surface text-foreground border-subtle m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border p-0 text-left shadow-xl backdrop:bg-black/60"
    >
      <div className="p-5">
        <div className="bg-warning/10 border-warning/30 rounded-lg border p-4">
          <p className="text-warning text-xs font-semibold tracking-wide uppercase">
            Unsaved changes
          </p>
          <h3 id={titleId} className="mt-1 text-lg font-semibold">
            Leave this report?
          </h3>
          <p className="text-muted mt-2 text-sm">
            Your game report changes have not been submitted. Leaving now will discard them.
          </p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={stay} className={buttonClass("success")}>
            Keep editing
          </button>
          <button type="button" onClick={leave} className={buttonClass("danger")}>
            Leave without saving
          </button>
        </div>
      </div>
    </dialog>
  );
}
