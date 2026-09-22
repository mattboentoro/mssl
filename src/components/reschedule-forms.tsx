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

export function RescheduleProposalForm({
  fixtures,
  selectedMatchId,
  selectedTeamId,
}: {
  fixtures: FixtureOption[];
  selectedMatchId?: string;
  selectedTeamId?: string;
}) {
  const [state, action] = useActionState(proposeRescheduleAction, {});
  const selected =
    fixtures.find(
      (fixture) =>
        (!selectedMatchId || fixture.id === selectedMatchId) &&
        (!selectedTeamId || fixture.requestingTeamId === selectedTeamId),
    ) ?? fixtures[0];

  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <div>
        <label className={labelClass} htmlFor="reschedule-fixture">
          Fixture
        </label>
        <select
          id="reschedule-fixture"
          name="matchTeam"
          defaultValue={selected ? `${selected.id}|${selected.requestingTeamId}` : ""}
          className={inputClass}
          required
          onChange={(event) => {
            const [matchId, teamId] = event.currentTarget.value.split("|");
            const form = event.currentTarget.form;
            if (form) {
              (form.elements.namedItem("matchId") as HTMLInputElement).value = matchId ?? "";
              (form.elements.namedItem("requestingTeamId") as HTMLInputElement).value =
                teamId ?? "";
            }
          }}
        >
          {fixtures.map((fixture) => (
            <option
              key={`${fixture.id}-${fixture.requestingTeamId}`}
              value={`${fixture.id}|${fixture.requestingTeamId}`}
            >
              {fixture.label}
            </option>
          ))}
        </select>
        <input type="hidden" name="matchId" defaultValue={selected?.id ?? ""} />
        <input
          type="hidden"
          name="requestingTeamId"
          defaultValue={selected?.requestingTeamId ?? ""}
        />
      </div>
      <RescheduleFields />
      <Submit>Send proposal</Submit>
    </form>
  );
}

function RescheduleFields({
  kickoff,
  venue,
  reason,
}: {
  kickoff?: string;
  venue?: string | null;
  reason?: string;
}) {
  return (
    <>
      <div>
        <label className={labelClass} htmlFor={`proposed-kickoff-${kickoff ?? "new"}`}>
          Proposed kickoff (required)
        </label>
        <input
          id={`proposed-kickoff-${kickoff ?? "new"}`}
          type="datetime-local"
          name="proposedKickoffAt"
          defaultValue={kickoff}
          className={inputClass}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`proposed-venue-${kickoff ?? "new"}`}>
          Proposed venue (optional)
        </label>
        <input
          id={`proposed-venue-${kickoff ?? "new"}`}
          name="proposedVenueName"
          defaultValue={venue ?? ""}
          maxLength={300}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`reschedule-reason-${kickoff ?? "new"}`}>
          Rationale (required)
        </label>
        <textarea
          id={`reschedule-reason-${kickoff ?? "new"}`}
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
  kickoff,
  venue,
  reason,
}: {
  requestId: string;
  kickoff: string;
  venue: string | null;
  reason: string;
}) {
  const [state, action] = useActionState(reviseRescheduleAction, {});
  return (
    <form action={action} className="mt-4 space-y-3 border-t border-current/10 pt-4">
      <input type="hidden" name="requestId" value={requestId} />
      <Feedback state={state} />
      <RescheduleFields kickoff={kickoff} venue={venue} reason={reason} />
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
