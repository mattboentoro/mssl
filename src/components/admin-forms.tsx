"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
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
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, className)}
      onClick={
        confirm
          ? (event) => {
              if (!window.confirm(confirm)) event.preventDefault();
            }
          : undefined
      }
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
