"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { buttonClass, type ButtonVariant } from "@/components/ui";

export interface ApiResult {
  ok?: boolean;
  message?: string;
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

/** POST a JSON body and normalise both success and typed-error responses. */
export async function postJson(url: string, body?: unknown): Promise<ApiResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  let payload: ApiResult = {};
  try {
    payload = (await response.json()) as ApiResult;
  } catch {
    payload = { error: `Server returned ${response.status}.` };
  }

  if (!response.ok) {
    return {
      ...payload,
      ok: false,
      error: payload.error ?? `Request failed (${response.status}).`,
    };
  }
  return { ...payload, ok: true };
}

/**
 * A button that performs one mutation, then refreshes the server components so
 * the page reflects the new state. Errors are shown inline rather than thrown,
 * because the interesting failures here (409 lost the race, 403 not your match)
 * are normal outcomes the referee needs to read.
 */
export function ActionButton({
  url,
  body,
  label,
  pendingLabel,
  variant = "primary",
  confirm,
  promptLabel,
  promptField,
  className,
  onDone,
}: {
  url: string;
  body?: unknown;
  label: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  confirm?: string;
  /** Ask for a free-text value before posting (e.g. a mandatory reason). */
  promptLabel?: string;
  promptField?: string;
  className?: string;
  onDone?: (result: ApiResult) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  const run = useCallback(async () => {
    if (confirm && !window.confirm(confirm)) return;

    let payload = body;
    if (promptLabel) {
      const answer = window.prompt(promptLabel);
      if (answer === null) return;
      payload = { ...(body as Record<string, unknown>), [promptField ?? "reason"]: answer };
    }

    setBusy(true);
    setResult(null);
    const outcome = await postJson(url, payload);
    setResult(outcome);
    setBusy(false);
    onDone?.(outcome);
    if (outcome.ok) startTransition(() => router.refresh());
  }, [body, confirm, onDone, promptField, promptLabel, router, url]);

  const isBusy = busy || pending;

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={isBusy}
        aria-busy={isBusy}
        className={buttonClass(variant, className)}
      >
        {isBusy ? (pendingLabel ?? "Working\u2026") : label}
      </button>
      {result && !result.ok ? (
        <span role="alert" className="text-danger text-xs">
          {result.error}
        </span>
      ) : null}
      {result?.ok && result.message ? (
        <span role="status" className="text-success text-xs">
          {result.message}
        </span>
      ) : null}
    </span>
  );
}
