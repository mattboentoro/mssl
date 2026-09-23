"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelScoreAppealAction,
  submitScoreAppealAction,
  type ScoreAppealActionState,
} from "@/app/captain/appeals/actions";
import { Alert, buttonClass, inputClass, labelClass } from "@/components/ui";
import { MAX_APPEAL_REASON_LENGTH } from "@/lib/score-appeals";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? "Submitting\u2026" : "Submit appeal"}
    </button>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("danger")}>
      {pending ? "Cancelling\u2026" : "Cancel pending appeal"}
    </button>
  );
}

export function ScoreAppealForm({
  matchId,
  teamId,
  homeTeamName,
  awayTeamName,
  homeScore,
  awayScore,
  homeForfeit,
  awayForfeit,
}: {
  matchId: string;
  teamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homeForfeit: boolean;
  awayForfeit: boolean;
}) {
  const [state, action] = useActionState<ScoreAppealActionState, FormData>(
    submitScoreAppealAction,
    {},
  );
  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="teamId" value={teamId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`home-score-${matchId}-${teamId}`} className={labelClass}>
            {homeTeamName} corrected score
          </label>
          <input
            id={`home-score-${matchId}-${teamId}`}
            className={inputClass}
            name="requestedHomeScore"
            type="number"
            min={0}
            max={99}
            step={1}
            required
            defaultValue={homeScore}
          />
          <label className="text-muted mt-2 flex items-center gap-2 text-sm">
            <input name="requestedHomeForfeit" type="checkbox" defaultChecked={homeForfeit} />
            Home team forfeited
          </label>
        </div>
        <div>
          <label htmlFor={`away-score-${matchId}-${teamId}`} className={labelClass}>
            {awayTeamName} corrected score
          </label>
          <input
            id={`away-score-${matchId}-${teamId}`}
            className={inputClass}
            name="requestedAwayScore"
            type="number"
            min={0}
            max={99}
            step={1}
            required
            defaultValue={awayScore}
          />
          <label className="text-muted mt-2 flex items-center gap-2 text-sm">
            <input name="requestedAwayForfeit" type="checkbox" defaultChecked={awayForfeit} />
            Away team forfeited
          </label>
        </div>
      </div>
      <div>
        <label htmlFor={`appeal-reason-${matchId}-${teamId}`} className={labelClass}>
          Reason (required)
        </label>
        <textarea
          id={`appeal-reason-${matchId}-${teamId}`}
          name="reason"
          rows={3}
          minLength={5}
          maxLength={MAX_APPEAL_REASON_LENGTH}
          required
          className={inputClass}
        />
      </div>
      <SubmitButton />
    </form>
  );
}

export function CancelScoreAppealForm({ appealId }: { appealId: string }) {
  const [state, action] = useActionState<ScoreAppealActionState, FormData>(
    cancelScoreAppealAction,
    {},
  );
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="appealId" value={appealId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert tone="success">{state.ok}</Alert> : null}
      <CancelButton />
    </form>
  );
}
