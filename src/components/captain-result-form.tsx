"use client";

import { useActionState } from "react";

import {
  respondToCaptainResultAction,
  submitCaptainResultAction,
  type CaptainResultActionState,
} from "@/app/captain/results/actions";
import { Alert, Button, Field, inputClass } from "@/components/ui";

const initialState: CaptainResultActionState = {};

export function CaptainResultForm({
  matchId,
  homeName,
  awayName,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
}) {
  const [state, action, pending] = useActionState(submitCaptainResultAction, initialState);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${homeName} score`} htmlFor="homeScore">
          <input
            className={inputClass}
            id="homeScore"
            name="homeScore"
            type="number"
            min="0"
            max="99"
            required
          />
        </Field>
        <Field label={`${awayName} score`} htmlFor="awayScore">
          <input
            className={inputClass}
            id="awayScore"
            name="awayScore"
            type="number"
            min="0"
            max="99"
            required
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label>
          <input className="mr-2" type="checkbox" name="homeForfeit" />
          {homeName} forfeited
        </label>
        <label>
          <input className="mr-2" type="checkbox" name="awayForfeit" />
          {awayName} forfeited
        </label>
      </div>
      <Field label="Notes" htmlFor="notes">
        <textarea className={inputClass} id="notes" name="notes" rows={4} maxLength={4000} />
      </Field>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit result"}
      </Button>
    </form>
  );
}

export function CaptainResultResponseForm({
  matchId,
  proposalId,
}: {
  matchId: string;
  proposalId: string;
}) {
  const [state, action, pending] = useActionState(respondToCaptainResultAction, initialState);
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <Field label="Response note" htmlFor="note">
        <textarea className={inputClass} id="note" name="note" rows={3} maxLength={4000} />
      </Field>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <div className="flex gap-3">
        <Button type="submit" name="decision" value="approve" variant="success" disabled={pending}>
          Approve
        </Button>
        <Button type="submit" name="decision" value="reject" variant="danger" disabled={pending}>
          Reject
        </Button>
      </div>
    </form>
  );
}
