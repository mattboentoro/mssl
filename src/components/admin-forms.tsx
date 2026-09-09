"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Alert, buttonClass, type ButtonVariant } from "@/components/ui";
import type { ActionState } from "@/app/admin/actions";

export type ServerAction<S extends ActionState = ActionState> = (
  prev: S,
  form: FormData,
) => Promise<S>;

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
 * A form bound to a server action, rendering its `ok` / `error` / `fieldErrors`
 * result. Children receive the current state so inputs can show inline errors.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: ServerAction;
  children: ReactNode | ((state: ActionState) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
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
      {state.ok ? (
        <Alert tone="success" className="mb-3">
          {state.ok}
        </Alert>
      ) : null}
      {typeof children === "function" ? children(state) : children}
    </form>
  );
}

export function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state.fieldErrors?.[name];
  if (!message) return null;
  return (
    <p className="text-danger mt-1 text-xs" role="alert">
      {message}
    </p>
  );
}
