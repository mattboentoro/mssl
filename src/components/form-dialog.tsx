"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";

import {
  ActionForm,
  SubmitButton,
  useActionResult,
  type ServerAction,
} from "@/components/admin-forms";
import { buttonClass } from "@/components/ui";

/** Dismisses the surrounding dialog once the server action reports success. */
function CloseOnSuccess({ onSuccess }: { onSuccess: () => void }) {
  const { ok } = useActionResult();
  useEffect(() => {
    if (ok) onSuccess();
  }, [ok, onSuccess]);
  return null;
}

/**
 * A "create" form tucked behind a button and shown in a modal.
 *
 * Built on the native `<dialog>` so focus trapping, Escape and the inert
 * backdrop come from the platform. The form is always rendered — never mounted
 * on open — so it stays in the server HTML and keeps working for anything that
 * reads the page without running scripts.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  fieldsClassName = "grid gap-3 sm:grid-cols-2",
  children,
}: {
  trigger: string;
  title: string;
  description?: ReactNode;
  action: ServerAction;
  submitLabel: string;
  fieldsClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useCallback(() => ref.current?.close(), []);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={buttonClass("primary")}
      >
        {trigger}
      </button>

      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="bg-surface text-foreground border-subtle m-auto w-[min(42rem,calc(100vw-2rem))] rounded-xl border p-0 shadow-xl backdrop:bg-black/60"
      >
        <div className="border-subtle flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h3 id={titleId} className="font-semibold">
              {title}
            </h3>
            {description ? <p className="text-muted mt-1 text-xs">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${title}`}
            className="text-muted hover:text-foreground text-lg leading-none"
          >
            {"\u00d7"}
          </button>
        </div>

        <div className="p-5">
          <ActionForm action={action} className="space-y-4">
            <div className={fieldsClassName}>{children}</div>
            <div className="border-subtle flex items-center justify-end gap-2 border-t pt-4">
              <button type="button" onClick={close} className={buttonClass("ghost")}>
                Cancel
              </button>
              <SubmitButton>{submitLabel}</SubmitButton>
            </div>
            <CloseOnSuccess onSuccess={close} />
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}
