"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelRescheduleAction,
  proposeRescheduleAction,
  respondToRescheduleAction,
  reviseRescheduleAction,
  type RescheduleActionState,
} from "@/app/captain/reschedules/actions";
import { Alert, buttonClass, inputClass, labelClass } from "@/components/ui";
import { MAX_RESCHEDULE_REASON_LENGTH } from "@/lib/reschedules";

function Submit({
  children,
  variant = "primary",
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant)}
    >
      {pending ? "Working\u2026" : children}
    </button>
  );
}

function Feedback({ state }: { state: RescheduleActionState }) {
  return (
    <>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
    </>
  );
}

interface FixtureOption {
  id: string;
  requestingTeamId: string;
  label: string;
}

export interface RescheduleSlotOption {
  id: string;
  label: string;
}

export function RescheduleProposalForm({
  fixture,
  slots,
}: {
  fixture: FixtureOption;
  slots: RescheduleSlotOption[];
}) {
  const [state, action] = useActionState(proposeRescheduleAction, {});

  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <p className="text-sm font-medium">{fixture.label}</p>
      <input type="hidden" name="matchId" value={fixture.id} />
      <input type="hidden" name="requestingTeamId" value={fixture.requestingTeamId} />
      <RescheduleFields slots={slots} />
      <Submit>Send proposal</Submit>
    </form>
  );
}

function RescheduleFields({
  slots,
  selectedSlotId,
  reason,
}: {
  slots: RescheduleSlotOption[];
  selectedSlotId?: string;
  reason?: string;
}) {
  return (
    <>
      <div>
        <label className={labelClass} htmlFor={`reschedule-slot-${selectedSlotId ?? "new"}`}>
          Available date, time, and venue (required)
        </label>
        <select
          id={`reschedule-slot-${selectedSlotId ?? "new"}`}
          name="slotId"
          defaultValue={selectedSlotId ?? ""}
          className={inputClass}
          required
        >
          <option value="" disabled>
            Select an available slot
          </option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass} htmlFor={`reschedule-reason-${selectedSlotId ?? "new"}`}>
          Rationale (required)
        </label>
        <textarea
          id={`reschedule-reason-${selectedSlotId ?? "new"}`}
          name="reason"
          defaultValue={reason}
          maxLength={MAX_RESCHEDULE_REASON_LENGTH}
          rows={3}
          className={inputClass}
          required
        />
      </div>
    </>
  );
}

export function RescheduleRevisionForm({
  requestId,
  slots,
  selectedSlotId,
  reason,
}: {
  requestId: string;
  slots: RescheduleSlotOption[];
  selectedSlotId?: string;
  reason: string;
}) {
  const [state, action] = useActionState(reviseRescheduleAction, {});
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-current/10 pt-4">
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      <RescheduleFields slots={slots} selectedSlotId={selectedSlotId} reason={reason} />
      <Submit variant="secondary">Revise proposal</Submit>
    </form>
  );
}

export function RescheduleCancelForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(cancelRescheduleAction, {});
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      <Submit variant="danger">Cancel request</Submit>
    </form>
  );
}

export function RescheduleResponseForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(respondToRescheduleAction, {});
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-current/10 pt-4">
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      <div>
        <label className={labelClass} htmlFor={`response-note-${requestId}`}>
          Response note (optional)
        </label>
        <textarea
          id={`response-note-${requestId}`}
          name="responseNote"
          maxLength={2000}
          rows={2}
          className={inputClass}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Submit name="decision" value="approve" variant="success">
          Approve for league review
        </Submit>
        <Submit name="decision" value="reject" variant="danger">
          Reject proposal
        </Submit>
      </div>
    </form>
  );
}
