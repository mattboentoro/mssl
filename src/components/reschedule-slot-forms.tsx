"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createRescheduleSlotAction,
  setRescheduleSlotAvailabilityAction,
  updateRescheduleSlotAction,
  type RescheduleSlotActionState,
} from "@/app/admin/reschedule-slots/actions";
import { Alert, buttonClass, inputClass, labelClass } from "@/components/ui";

function Submit({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant)}>
      {pending ? "Saving\u2026" : children}
    </button>
  );
}

function Feedback({ state }: { state: RescheduleSlotActionState }) {
  return (
    <>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
    </>
  );
}

export function CreateRescheduleSlotForm() {
  const [state, action] = useActionState(createRescheduleSlotAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Feedback state={state} />
      <div>
        <label className={labelClass} htmlFor="new-slot-kickoff">
          Date and time
        </label>
        <input
          id="new-slot-kickoff"
          type="datetime-local"
          name="kickoffAt"
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="new-slot-venue">
          Venue
        </label>
        <input
          id="new-slot-venue"
          name="venueName"
          maxLength={300}
          className={inputClass}
          required
        />
      </div>
      <Submit>Add slot</Submit>
    </form>
  );
}

export function EditRescheduleSlotForm({
  slot,
}: {
  slot: {
    id: string;
    kickoffInput: string;
    venueName: string;
    updatedAt: string;
  };
}) {
  const [state, action] = useActionState(updateRescheduleSlotAction, {});
  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="slotId" value={slot.id} />
      <input type="hidden" name="expectedUpdatedAt" value={slot.updatedAt} />
      <Feedback state={state} />
      <div>
        <label className={labelClass} htmlFor={`slot-kickoff-${slot.id}`}>
          Date and time
        </label>
        <input
          id={`slot-kickoff-${slot.id}`}
          type="datetime-local"
          name="kickoffAt"
          defaultValue={slot.kickoffInput}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`slot-venue-${slot.id}`}>
          Venue
        </label>
        <input
          id={`slot-venue-${slot.id}`}
          name="venueName"
          defaultValue={slot.venueName}
          maxLength={300}
          className={inputClass}
          required
        />
      </div>
      <Submit variant="secondary">Save</Submit>
    </form>
  );
}

export function RescheduleSlotAvailabilityForm({
  slotId,
  enable,
}: {
  slotId: string;
  enable: boolean;
}) {
  const [state, action] = useActionState(setRescheduleSlotAvailabilityAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="slotId" value={slotId} />
      <input type="hidden" name="available" value={String(enable)} />
      <Feedback state={state} />
      <Submit variant={enable ? "secondary" : "danger"}>{enable ? "Enable" : "Disable"}</Submit>
    </form>
  );
}
