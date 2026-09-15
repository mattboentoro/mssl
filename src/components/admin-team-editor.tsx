"use client";

import { deleteTeamAction, updateTeamAction } from "@/app/admin/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { Field, inputClass } from "@/components/ui";

export interface EditableTeam {
  id: string;
  name: string;
  slug: string;
  shortName: string;
  divisionId: string;
  colorPrimary: string;
  colorAlternate: string;
  captainName: string | null;
  contactEmail: string | null;
}

/**
 * Edit or delete one team.
 *
 * Collapsed behind a disclosure so a twenty-team list stays scannable; the
 * destructive delete lives inside the same panel, where it cannot be hit by
 * accident from the list view.
 */
export function TeamEditor({
  team,
  divisions,
}: {
  team: EditableTeam;
  divisions: { id: string; name: string }[];
}) {
  return (
    <details className="mt-2">
      <summary className="text-muted hover:text-fg cursor-pointer text-xs underline">
        Edit details
      </summary>

      <div className="border-subtle mt-3 space-y-4 rounded-lg border p-3">
        <ActionForm
          action={updateTeamAction}
          resetOnSuccess={false}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="teamId" value={team.id} />

          <Field label="Division" htmlFor={`team-${team.id}-division`}>
            <select
              id={`team-${team.id}-division`}
              name="divisionId"
              defaultValue={team.divisionId}
              className={inputClass}
              required
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Name" htmlFor={`team-${team.id}-name`}>
            <input
              id={`team-${team.id}-name`}
              name="name"
              defaultValue={team.name}
              className={inputClass}
              required
            />
            <FieldError name="name" />
          </Field>

          <Field label="Short name" htmlFor={`team-${team.id}-short`}>
            <input
              id={`team-${team.id}-short`}
              name="shortName"
              defaultValue={team.shortName}
              maxLength={24}
              className={inputClass}
            />
            <FieldError name="shortName" />
          </Field>

          <Field
            label="Slug"
            htmlFor={`team-${team.id}-slug`}
            hint="Used in the team's URL. Changing it breaks existing links."
          >
            <input
              id={`team-${team.id}-slug`}
              name="slug"
              defaultValue={team.slug}
              className={inputClass}
            />
            <FieldError name="slug" />
          </Field>

          <Field
            label="Primary colour"
            htmlFor={`team-${team.id}-primary-label`}
            hint="Home / first-choice kit."
          >
            <ColorPalettePicker
              name="colorPrimary"
              defaultValue={team.colorPrimary}
              labelledBy={`team-${team.id}-primary-label`}
            />
            <FieldError name="colorPrimary" />
          </Field>

          <Field
            label="Alternate colour"
            htmlFor={`team-${team.id}-alternate-label`}
            hint="Worn when the kits would clash."
          >
            <ColorPalettePicker
              name="colorAlternate"
              defaultValue={team.colorAlternate}
              labelledBy={`team-${team.id}-alternate-label`}
            />
            <FieldError name="colorAlternate" />
          </Field>

          <Field label="Captain" htmlFor={`team-${team.id}-captain`}>
            <input
              id={`team-${team.id}-captain`}
              name="captainName"
              defaultValue={team.captainName ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Contact e-mail" htmlFor={`team-${team.id}-email`}>
            <input
              id={`team-${team.id}-email`}
              name="contactEmail"
              type="email"
              defaultValue={team.contactEmail ?? ""}
              className={inputClass}
            />
            <FieldError name="contactEmail" />
          </Field>

          <div className="sm:col-span-2">
            <SubmitButton>Save changes</SubmitButton>
          </div>
        </ActionForm>

        <div className="border-subtle border-t pt-3">
          <ActionForm action={deleteTeamAction} resetOnSuccess={false} className="space-y-2">
            <input type="hidden" name="teamId" value={team.id} />
            <Field
              label="Delete team"
              htmlFor={`team-${team.id}-confirm`}
              hint={`Type “${team.name}” to confirm. Unplayed fixtures go with it; a team with a filed report cannot be deleted.`}
            >
              <input
                id={`team-${team.id}-confirm`}
                name="confirmName"
                aria-label={`Type ${team.name} to confirm deletion`}
                placeholder={team.name}
                className={`${inputClass} text-xs`}
                required
              />
            </Field>
            <SubmitButton
              variant="danger"
              confirm={`Delete ${team.name} and its unplayed fixtures? This cannot be undone.`}
            >
              Delete team
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    </details>
  );
}
