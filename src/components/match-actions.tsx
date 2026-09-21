"use client";

import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";

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
  successLabel,
  successDelayMs = 0,
  variant = "primary",
  confirm,
  confirmTitle = "Confirm action",
  confirmActionLabel,
  confirmCancelLabel = "Cancel",
  promptLabel,
  promptField,
  className,
  onDone,
}: {
  url: string;
  body?: unknown;
  label: string;
  pendingLabel?: string;
  successLabel?: string;
  /** Keep the success state visible before refreshing server components. */
  successDelayMs?: number;
  variant?: ButtonVariant;
  confirm?: string;
  confirmTitle?: string;
  confirmActionLabel?: string;
  confirmCancelLabel?: string;
  /** Ask for a free-text value before posting (e.g. a mandatory reason). */
  promptLabel?: string;
  promptField?: string;
  className?: string;
  onDone?: (result: ApiResult) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const run = useCallback(async () => {
    let payload = body;
    if (promptLabel) {
      payload = {
        ...(body as Record<string, unknown>),
        [promptField ?? "reason"]: promptValue,
      };
    }

    setBusy(true);
    setResult(null);
    const outcome = await postJson(url, payload);
    setResult(outcome);
    setBusy(false);
    onDone?.(outcome);
    if (outcome.ok) {
      dialogRef.current?.close();
      if (successDelayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, successDelayMs));
      }
      startTransition(() => router.refresh());
    }
  }, [body, onDone, promptField, promptLabel, promptValue, router, successDelayMs, url]);

  const isBusy = busy || pending;
  const succeeded = Boolean(result?.ok);
  const start = () => {
    setResult(null);
    if (confirm || promptLabel) dialogRef.current?.showModal();
    else void run();
  };

  return (
    <>
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          onClick={start}
          disabled={isBusy || succeeded}
          aria-busy={isBusy}
          className={buttonClass(succeeded && successLabel ? "success" : variant, className)}
        >
          {isBusy ? (
            <>
              <span
                aria-hidden="true"
                className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
              />
              {pendingLabel ?? "Working\u2026"}
            </>
          ) : succeeded && successLabel ? (
            successLabel
          ) : (
            label
          )}
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
      {confirm || promptLabel ? (
        <dialog
          ref={dialogRef}
          aria-labelledby={dialogTitleId}
          onClick={(event) => {
            if (event.target === event.currentTarget && !isBusy) {
              dialogRef.current?.close();
            }
          }}
          className="bg-surface text-foreground border-subtle m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border p-0 text-left shadow-xl backdrop:bg-black/60"
        >
          <div className="p-5">
            <div
              className={
                confirm
                  ? "bg-danger/10 border-danger/30 rounded-lg border p-4"
                  : "bg-warning/10 border-warning/30 rounded-lg border p-4"
              }
            >
              <p
                className={`text-xs font-semibold tracking-wide uppercase ${
                  confirm ? "text-danger" : "text-warning"
                }`}
              >
                {confirm ? "Confirmation required" : "Details required"}
              </p>
              <h3 id={dialogTitleId} className="mt-1 text-lg font-semibold">
                {confirm ? confirmTitle : label}
              </h3>
              <p className="text-muted mt-2 text-sm">
                {confirm ?? promptLabel}
                {promptLabel ? (
                  <>
                    <span aria-hidden="true" className="text-danger ml-0.5 font-semibold">
                      *
                    </span>
                    <span className="sr-only"> (required)</span>
                  </>
                ) : null}
              </p>
            </div>

            {promptLabel ? (
              <div className="mt-4">
                <label htmlFor={`${dialogTitleId}-input`} className="sr-only">
                  {promptLabel}
                </label>
                <textarea
                  id={`${dialogTitleId}-input`}
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  rows={3}
                  autoFocus
                  required
                  aria-required="true"
                  className="bg-surface border-subtle w-full rounded-lg border px-3 py-2 text-sm shadow-sm"
                />
              </div>
            ) : null}

            {result && !result.ok ? (
              <p role="alert" className="text-danger mt-3 text-sm">
                {result.error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                disabled={isBusy}
                className={buttonClass("success")}
              >
                {confirm ? confirmCancelLabel : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => void run()}
                disabled={isBusy || Boolean(promptLabel && !promptValue.trim())}
                aria-busy={isBusy}
                className={buttonClass(confirm ? "danger" : "primary")}
              >
                {isBusy
                  ? (pendingLabel ?? "Working\u2026")
                  : (confirmActionLabel ?? label)}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
