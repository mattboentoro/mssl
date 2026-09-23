"use client";

import { useActionState, type ReactNode } from "react";

import type { RosterActionState } from "@/app/roster/actions";
import { Alert, Button, type ButtonVariant } from "@/components/ui";

export function RosterActionForm({
  action,
  children,
  submitLabel,
  variant = "primary",
  className,
}: {
  action: (state: RosterActionState, form: FormData) => Promise<RosterActionState>;
  children?: ReactNode;
  submitLabel: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Saving\u2026" : submitLabel}
      </Button>
      {state.error ? (
        <Alert className="mt-2" tone="danger">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert className="mt-2" tone="success">
          {state.ok}
        </Alert>
      ) : null}
    </form>
  );
}
