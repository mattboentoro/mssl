"use client";

import {
  createContext,
  useActionState,
  useContext,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import { Alert, buttonClass, type ButtonVariant } from "@/components/ui";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  if (confirm) {
    return (
      <>
        <button
          type="button"
          disabled={pending}
          className={buttonClass(variant, className)}
          onClick={() => dialogRef.current?.showModal()}
        >
          {pending ? "Working\u2026" : children}
        </button>
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
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
              <p className="text-muted mt-2 text-sm">{confirm}</p>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                disabled={pending}
                className={buttonClass("success")}
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
  if (!message) return null;
  return (
    <p className="text-danger mt-1 text-xs" role="alert">
      {message}
    </p>
  );
}
