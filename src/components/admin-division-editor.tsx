"use client";

import { deleteDivisionAction, updateDivisionAction } from "@/app/admin/actions";
import { ActionForm, FieldError, SubmitButton } from "@/components/admin-forms";
import { CloseOnSuccess, Dialog, DialogCancel } from "@/components/form-dialog";
import { Field, buttonClass, inputClass } from "@/components/ui";

export interface EditableDivision {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  teamCount: number;
  matchCount: number;
}

/**
 * Rename or delete one division.
 *
 * Both live in the same modal: renaming is routine, deleting takes the
 * division's clubs and their fixtures with it, and keeping the destructive one
 * behind the same button means it can never be hit from the list view.
 */
export function DivisionEditor({ division }: { division: EditableDivision }) {
  return (
    <Dialog
      trigger="Edit"
      triggerLabel={`Edit ${division.name}`}
      triggerClassName={`${buttonClass("ghost")} shrink-0 px-2 py-1 text-xs`}
      title={`Edit ${division.name}`}
    >
      <div className="space-y-4">
        <ActionForm action={updateDivisionAction} resetOnSuccess={false} className="space-y-3">
          <input type="hidden" name="divisionId" value={division.id} />
          {/* The web address is set once, at creation, so a rename never breaks
              a link that already points here. */}
          <input type="hidden" name="slug" value={division.slug} />
          {/* Position is carried through untouched — the list order is set when
              the division is created and is not worth an admin field. */}
          <input type="hidden" name="sortOrder" value={division.sortOrder} />

          <Field label="Name" htmlFor={`division-${division.id}-name`}>
            <input
              id={`division-${division.id}-name`}
              name="name"
              defaultValue={division.name}
              className={inputClass}
              required
            />
            <FieldError name="name" />
          </Field>

          <div className="border-subtle flex items-center justify-end gap-2 border-t pt-3">
            <DialogCancel />
            <SubmitButton>Save changes</SubmitButton>
          </div>
          <CloseOnSuccess />
        </ActionForm>

        {/*
            Deleting a division takes its clubs and their fixtures with it, so
            the name has to be retyped. The action refuses outright once any of
            those fixtures has a filed report.
          */}
        <div className="border-subtle border-t pt-3">
          <ActionForm action={deleteDivisionAction} resetOnSuccess={false} className="space-y-2">
            <input type="hidden" name="divisionId" value={division.id} />
            <Field
              label="Delete division"
              htmlFor={`division-${division.id}-confirm`}
              hint={`Type “${division.name}” to confirm. Its ${division.teamCount} club(s) and ${division.matchCount} fixture(s) go with it; a division with a filed report cannot be deleted.`}
            >
              <input
                id={`division-${division.id}-confirm`}
                name="confirmName"
                aria-label={`Type ${division.name} to confirm deletion`}
                placeholder={division.name}
                className={`${inputClass} text-xs`}
                required
              />
            </Field>
            <SubmitButton
              variant="danger"
              confirm={`Delete ${division.name}, its ${division.teamCount} club(s) and ${division.matchCount} fixture(s)? This cannot be undone.`}
            >
              Delete division
            </SubmitButton>
            <CloseOnSuccess />
          </ActionForm>
        </div>
      </div>
    </Dialog>
  );
}
