"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ActionForm,
  SubmitButton,
  useActionResult,
  type ServerAction,
} from "@/components/admin-forms";
import { buttonClass, outlineButtonClass } from "@/components/ui";

const DialogCloseContext = createContext<() => void>(() => {});

/** Dismisses the surrounding dialog. A no-op outside one. */
export function useDialogClose() {
  return useContext(DialogCloseContext);
}

/** Dismisses the surrounding dialog once the server action reports success. */
export function CloseOnSuccess() {
  const close = useContext(DialogCloseContext);
  const { ok } = useActionResult();
  useEffect(() => {
    if (ok) close();
  }, [ok, close]);
  return null;
}

/** A "leave it alone" button for a dialog footer. */
export function DialogCancel({ children = "Cancel" }: { children?: ReactNode }) {
  const close = useContext(DialogCloseContext);
  return (
    <button type="button" onClick={close} className={buttonClass("ghost")}>
      {children}
    </button>
  );
}

/**
 * A titled modal behind a trigger button.
 *
 * Built on the native `<dialog>` so focus trapping, Escape and the inert
 * backdrop come from the platform. The contents are always rendered — never
 * mounted on open — so they stay in the server HTML and keep working for
 * anything that reads the page without running scripts.
 */
export function Dialog({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  description,
  widthClassName = "w-[min(42rem,calc(100vw-2rem))]",
  children,
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
  title: string;
  description?: ReactNode;
  widthClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [generation, setGeneration] = useState(0);
  const close = useCallback(() => ref.current?.close(), []);
  const open = useCallback(() => ref.current?.showModal(), []);
  const closeValue = useMemo(() => close, [close]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={triggerLabel}
        className={triggerClassName ?? buttonClass("primary")}
      >
        {trigger}
      </button>

      <dialog
        ref={ref}
        onClose={() => setGeneration((n) => n + 1)}
        aria-labelledby={titleId}
        className={`bg-surface text-foreground border-subtle m-auto max-h-[calc(100vh-4rem)] ${widthClassName} rounded-xl border p-0 text-left shadow-xl backdrop:bg-black/60`}
      >
        <DialogCloseContext.Provider value={closeValue}>
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

          <div className="p-5" key={generation}>
            {children}
          </div>
        </DialogCloseContext.Provider>
      </dialog>
    </>
  );
}

/**
 * A single server-action form tucked behind a button and shown in a modal.
 * Owns its own footer, so callers pass fields and a submit label.
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
  return (
    <Dialog
      trigger={trigger}
      title={title}
      description={description}
      triggerClassName={outlineButtonClass}
    >
      <ActionForm action={action} className="space-y-4" showSuccess={false}>
        <div className={fieldsClassName}>{children}</div>
        <div className="border-subtle flex items-center justify-end gap-2 border-t pt-4">
          <DialogCancel />
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <CloseOnSuccess />
      </ActionForm>
    </Dialog>
  );
}
