"use client";

import { deleteSeasonAction, updateSeasonAction } from "@/app/admin/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { CloseOnSuccess, Dialog, DialogCancel } from "@/components/form-dialog";
import { Field, buttonClass, inputClass } from "@/components/ui";

export interface EditableSeason {
  id: string;
  name: string;
  slug: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  tiebreakerMode: string;
}

/**
 * Everything that can be done to one season, behind a single Edit button.
 *
 * The dates and the ranking rule sit next to the destructive options on
 * purpose: activating a different season and deleting this one both reach well
 * beyond the row, and neither belongs on the list view where it can be hit by
 * accident.
 */
export function SeasonEditor({ season }: { season: EditableSeason }) {
  return (
    <Dialog
      trigger="Edit"
      triggerLabel={`Edit ${season.name}`}
      triggerClassName={`${buttonClass("ghost")} shrink-0 px-2 py-1 text-xs`}
      title={`Edit ${season.name}`}
    >
      <div className="space-y-4">
        <ActionForm
          action={updateSeasonAction}
          resetOnSuccess={false}
          showSuccess={false}
          className="grid gap-3 sm:grid-cols-2"
        >
          <input type="hidden" name="seasonId" value={season.id} />
          {/* The web address is set once, at creation, so a rename never breaks
              a link that already points here. */}
          <input type="hidden" name="slug" value={season.slug} />

          <Field label="Name" htmlFor={`season-${season.id}-name`}>
            <input
              id={`season-${season.id}-name`}
              name="name"
              defaultValue={season.name}
              className={inputClass}
              required
            />
            <FieldError name="name" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Starts" htmlFor={`season-${season.id}-start`}>
              <input
                id={`season-${season.id}-start`}
                name="startsOn"
                type="date"
                defaultValue={season.startsOn}
                className={inputClass}
                required
              />
              <FieldError name="startsOn" />
            </Field>
            <Field label="Ends" htmlFor={`season-${season.id}-end`}>
              <input
                id={`season-${season.id}-end`}
                name="endsOn"
                type="date"
                defaultValue={season.endsOn}
                className={inputClass}
                required
              />
              <FieldError name="endsOn" />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Ranked on" htmlFor={`tiebreak-${season.id}`}>
              <select
                id={`tiebreak-${season.id}`}
                name="tiebreakerMode"
                defaultValue={season.tiebreakerMode}
                className={inputClass}
              >
                <option value="POINTS">Total points</option>
                <option value="POINTS_PER_GAME">Points per game</option>
              </select>
            </Field>
          </div>

          {/* The active season is the one the whole site defaults to, so the
              toggle only ever switches one on: clearing it on the active
              season would leave the league with none, and the action ignores
              that rather than obeying it. */}
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={season.isActive}
              disabled={season.isActive}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Active season
              <span className="text-muted block text-xs">
                {season.isActive
                  ? "The site defaults to this season. Activate another one to move on."
                  : "Makes this the season the site defaults to, and stands the current one down."}
              </span>
            </span>
          </label>

          <div className="border-subtle flex items-center justify-end gap-2 border-t pt-3 sm:col-span-2">
            <DialogCancel />
            <SubmitButton>Save changes</SubmitButton>
          </div>
          <CloseOnSuccess />
        </ActionForm>

        {season.isActive ? (
          <p className="text-muted border-subtle border-t pt-3 text-xs">
            Activate another season before this one can be deleted.
          </p>
        ) : (
          <div className="border-subtle border-t pt-3">
            {/* Deleting a season takes its fixtures and reports with it, so the
                name has to be retyped. */}
            <ActionForm
              action={deleteSeasonAction}
              resetOnSuccess={false}
              showSuccess={false}
              className="space-y-2"
            >
              <input type="hidden" name="seasonId" value={season.id} />
              <Field
                label="Delete season"
                htmlFor={`season-${season.id}-confirm`}
                hint={`Type “${season.name}” to confirm. Its fixtures and reports go with it; the divisions and clubs stay.`}
              >
                <input
                  id={`season-${season.id}-confirm`}
                  name="confirmName"
                  aria-label={`Type ${season.name} to confirm deletion`}
                  placeholder={season.name}
                  className={`${inputClass} text-xs`}
                  required
                />
              </Field>
              <SubmitButton
                variant="danger"
                confirm={`Delete ${season.name} and every fixture and report inside it? This cannot be undone.`}
              >
                Delete season
              </SubmitButton>
              <CloseOnSuccess />
            </ActionForm>
          </div>
        )}
      </div>
    </Dialog>
  );
}
