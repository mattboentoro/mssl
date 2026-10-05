"use client";

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import { Alert, buttonClass, type ButtonVariant } from "@/components/ui";
import { useModalDialog } from "@/components/use-modal-dialog";
import type { ActionState } from "@/app/admin/actions";

export type ServerAction<S extends ActionState = ActionState> = (
  prev: S,
  form: FormData,
) => Promise<S>;

/**
 * Server components cannot pass functions across the RSC boundary, so the
 * current action state is published through context instead of a render prop.
 */
const ActionStateContext = createContext<ActionState>({});

export function SubmitButton({
  children,
  variant = "primary",
  name,
  value,
  confirm,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  name?: string;
  value?: string;
  confirm?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const { ref: dialogRef, open, restoreFocus, onKeyDown } = useModalDialog();
  const titleId = useId();
  const descriptionId = useId();

  if (confirm) {
    return (
      <>
        <button
          type="button"
          disabled={pending}
          className={buttonClass(variant, className)}
          onClick={open}
        >
          {pending ? "Working\u2026" : children}
        </button>
        <dialog
          ref={dialogRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClose={restoreFocus}
          onCancel={(event) => {
            if (pending) event.preventDefault();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !pending) dialogRef.current?.close();
          }}
          className="bg-surface text-foreground border-subtle m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border p-0 text-left shadow-xl backdrop:bg-black/60"
        >
          <div className="p-5">
            <div className="bg-danger/10 border-danger/30 rounded-lg border p-4">
              <p className="text-danger text-xs font-semibold tracking-wide uppercase">
                Confirmation required
              </p>
              <h3 id={titleId} className="mt-1 text-lg font-semibold">
                Are you sure?
              </h3>
              <p id={descriptionId} className="text-muted mt-2 text-sm">
                {confirm}
              </p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                data-dialog-initial-focus
                onClick={() => dialogRef.current?.close()}
                disabled={pending}
                className={buttonClass("secondary")}
              >
                Keep
              </button>
              <button
                type="submit"
                name={name}
                value={value}
                disabled={pending}
                className={buttonClass(variant === "danger" ? "danger" : "primary")}
              >
                {pending ? "Working\u2026" : children}
              </button>
            </div>
          </div>
        </dialog>
      </>
    );
  }

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? "Working\u2026" : children}
    </button>
  );
}

/**
 * A form bound to a server action, rendering its `ok` / `error` result and
 * making `fieldErrors` available to any nested {@link FieldError}.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  showSuccess = true,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /**
   * Whether a successful result gets a banner. Forms inside a dialog set this
   * to `false`: the dialog closes on success, so the banner would be announcing
   * the save to a panel nobody is looking at any more.
   */
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <ActionStateContext.Provider value={state}>
      <form
        action={formAction}
        className={className}
        key={resetOnSuccess && state.ok ? state.ok : undefined}
      >
        {state.error ? (
          <Alert tone="danger" className="mb-3">
            {state.error}
          </Alert>
        ) : null}
        {showSuccess && state.ok ? (
          <Alert tone="success" className="mb-3">
            {state.ok}
          </Alert>
        ) : null}
        {children}
      </form>
    </ActionStateContext.Provider>
  );
}

/**
 * Current server-action result for the enclosing {@link ActionForm}.
 *
 * Lets a wrapper — a dialog, say — react to a submission it did not render,
 * since the state lives inside `ActionForm` and cannot be lifted without
 * pushing `useActionState` across the RSC boundary.
 */
export function useActionResult() {
  return useContext(ActionStateContext);
}

/** Inline validation message for a single field, read from the enclosing form. */ export function FieldError({
  name,
}: {
  name: string;
}) {
  const state = useContext(ActionStateContext);
  const message = state.fieldErrors?.[name];
  const id = useId();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!message) return;
    const field = ref.current?.parentElement;
    const control =
      field?.tagName === "FIELDSET"
        ? field
        : field?.querySelector<HTMLElement>(
            'input:not([type="hidden"]), select, textarea, [role="radiogroup"]',
          );
    if (!control) return;
    const invalid = control.getAttribute("aria-invalid");
    control.setAttribute("aria-invalid", "true");
    control.setAttribute(
      "aria-describedby",
      [control.getAttribute("aria-describedby"), id].filter(Boolean).join(" "),
    );
    return () => {
      const remaining = control
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .filter((token) => token !== id)
        .join(" ");
      if (remaining) control.setAttribute("aria-describedby", remaining);
      else control.removeAttribute("aria-describedby");
      if (invalid) control.setAttribute("aria-invalid", invalid);
      else control.removeAttribute("aria-invalid");
    };
  }, [message, id]);
  if (!message) return null;
  return (
    <p ref={ref} id={id} className="text-danger mt-1 text-xs" role="alert">
      {message}
    </p>
  );
}
