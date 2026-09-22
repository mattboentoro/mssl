"use client";

import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { Field, inputClass } from "@/components/ui";
import { submitFreeAgentRequest, withdrawFreeAgentRequest } from "@/app/free-agents/actions";
import { PLAYER_POSITIONS, PLAYER_POSITION_LABELS } from "@/lib/enums";

export type FreeAgentFormDefaults = {
  yearsExperience: number | null;
  preferredPosition: string;
  preferredDivisionId: string | null;
  phone: string | null;
  notes: string | null;
};

type DivisionOption = { id: string; name: string };

/**
 * The questionnaire itself.
 *
 * Name and e-mail are not fields: they come from the signed-in account, so
 * there is nothing here for a player to mistype and nothing for the league to
 * reconcile afterwards.
 */
export function FreeAgentForm({
  divisions,
  defaults,
  isUpdate,
}: {
  divisions: DivisionOption[];
  defaults: FreeAgentFormDefaults | null;
  isUpdate: boolean;
}) {
  return (
    // An existing request is being edited, so the fields must survive the
    // round trip rather than being cleared the way a fresh entry form is.
    <ActionForm action={submitFreeAgentRequest} resetOnSuccess={!isUpdate}>
      <div className="grid gap-4">
        <Field
          label="How many years of soccer experience do you have?"
          htmlFor="yearsExperience"
          hint="Whole years. Enter 0 if you are new to the game."
        >
          <input
            className={inputClass}
            defaultValue={defaults?.yearsExperience ?? ""}
            id="yearsExperience"
            inputMode="numeric"
            max={60}
            min={0}
            name="yearsExperience"
            required
            step={1}
            type="number"
          />
          <FieldError name="yearsExperience" />
        </Field>

        <Field label="Do you have a preferred position on the field?" htmlFor="preferredPosition">
          <select
            className={inputClass}
            defaultValue={defaults?.preferredPosition ?? "ANY"}
            id="preferredPosition"
            name="preferredPosition"
            required
          >
            {PLAYER_POSITIONS.map((position) => (
              <option key={position} value={position}>
                {PLAYER_POSITION_LABELS[position]}
              </option>
            ))}
          </select>
          <FieldError name="preferredPosition" />
        </Field>

        <Field
          label="Do you have a preference for which division you would like to be in?"
          htmlFor="preferredDivisionId"
          hint="Captains place players wherever there is room, so this is a preference rather than a promise."
        >
          <select
            className={inputClass}
            defaultValue={defaults?.preferredDivisionId ?? ""}
            id="preferredDivisionId"
            name="preferredDivisionId"
          >
            <option value="">No preference</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
          <FieldError name="preferredDivisionId" />
        </Field>

        <Field
          label="Phone number"
          htmlFor="phone"
          hint="Optional. Only used to reach you about a team."
        >
          <input
            autoComplete="tel"
            className={inputClass}
            defaultValue={defaults?.phone ?? ""}
            id="phone"
            name="phone"
            type="tel"
          />
          <FieldError name="phone" />
        </Field>

        <Field
          label="Anything else a captain should know?"
          htmlFor="notes"
          hint="Optional. Availability, previous clubs, whether you can keep goal in a pinch."
        >
          <textarea
            className={inputClass}
            defaultValue={defaults?.notes ?? ""}
            id="notes"
            name="notes"
            rows={4}
          />
          <FieldError name="notes" />
        </Field>
      </div>

      <div className="mt-4">
        <SubmitButton>{isUpdate ? "Update my request" : "Submit request"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Take an existing request off the list. Separate form, separate action. */
export function WithdrawFreeAgentForm() {
  return (
    <ActionForm action={withdrawFreeAgentRequest} resetOnSuccess={false}>
      <SubmitButton
        confirm="Withdraw your free-agent request? The league will no longer see it."
        variant="danger"
      >
        Withdraw my request
      </SubmitButton>
    </ActionForm>
  );
}
