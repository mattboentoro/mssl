"use client";

import { useRef, useState } from "react";

import { FieldError } from "@/components/admin-forms";
import { Field, buttonClass, inputClass } from "@/components/ui";

export interface CaptainInput {
  id?: string;
  name: string;
  email: string | null;
}

interface CaptainRow extends CaptainInput {
  key: string;
}

const MAX_CAPTAINS = 5;

export function CaptainFields({
  idPrefix,
  defaultCaptains = [],
}: {
  idPrefix: string;
  defaultCaptains?: CaptainInput[];
}) {
  const nextKey = useRef(defaultCaptains.length);
  const [captains, setCaptains] = useState<CaptainRow[]>(() => {
    const initial = defaultCaptains.map((captain, index) => ({
      ...captain,
      key: captain.id ?? `existing-${index}`,
    }));
    return initial.length > 0 ? initial : [{ key: "initial", name: "", email: "" }];
  });

  function addCaptain() {
    if (captains.length >= MAX_CAPTAINS) return;
    const key = `new-${nextKey.current}`;
    nextKey.current += 1;
    setCaptains((current) => [...current, { key, name: "", email: "" }]);
  }

  function removeCaptain(key: string) {
    if (captains.length <= 1) return;
    setCaptains((current) => current.filter((captain) => captain.key !== key));
  }

  return (
    <fieldset className="border-subtle space-y-3 border-t pt-3 sm:col-span-2">
      <legend className="sr-only">Captains</legend>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Captains</p>
          <p className="text-muted text-xs">Every team needs 1 to {MAX_CAPTAINS} captains.</p>
        </div>
        <button
          type="button"
          className={buttonClass("ghost", "px-2 py-1 text-xs")}
          onClick={addCaptain}
          disabled={captains.length >= MAX_CAPTAINS}
        >
          Add captain
        </button>
      </div>

      <FieldError name="captains" />

      {captains.length === 0 ? (
        <p className="text-muted text-sm">No captains assigned.</p>
      ) : (
        <div className="space-y-3">
          {captains.map((captain, index) => {
            const nameId = `${idPrefix}-captain-${index}-name`;
            const emailId = `${idPrefix}-captain-${index}-email`;
            return (
              <div
                key={captain.key}
                className="border-subtle grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
              >
                <Field label={`Captain ${index + 1} name`} htmlFor={nameId}>
                  <input
                    id={nameId}
                    name="captainName"
                    defaultValue={captain.name}
                    maxLength={120}
                    className={inputClass}
                    required
                  />
                  <FieldError name={`captains.${index}.name`} />
                </Field>
                <Field label={`Captain ${index + 1} e-mail`} htmlFor={emailId}>
                  <input
                    id={emailId}
                    name="captainEmail"
                    type="email"
                    defaultValue={captain.email ?? ""}
                    className={inputClass}
                  />
                  <FieldError name={`captains.${index}.email`} />
                </Field>
                <button
                  type="button"
                  className={buttonClass("ghost", "self-end px-2 py-2 text-xs")}
                  onClick={() => removeCaptain(captain.key)}
                  aria-label={`Remove captain ${index + 1}`}
                  disabled={captains.length <= 1}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
