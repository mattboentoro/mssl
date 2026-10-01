"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  cancelScoreAppealAction,
  submitScoreAppealAction,
  type ScoreAppealActionState,
} from "@/app/captain/appeals/actions";
import { Alert, buttonClass, inputClass, labelClass } from "@/components/ui";
import { MAX_APPEAL_REASON_LENGTH } from "@/lib/score-appeals";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !ready}
      className={buttonClass(
        "primary",
        "disabled:bg-surface-muted disabled:text-muted disabled:border-subtle disabled:border",
      )}
    >
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
  const [requestedHomeScore, setRequestedHomeScore] = useState("");
  const [requestedAwayScore, setRequestedAwayScore] = useState("");
  const [reason, setReason] = useState("");
  const [requestedHomeForfeit, setRequestedHomeForfeit] = useState(homeForfeit);
  const [requestedAwayForfeit, setRequestedAwayForfeit] = useState(!homeForfeit && awayForfeit);
  const ready = requestedHomeScore !== "" && requestedAwayScore !== "" && reason.trim().length >= 5;

  return (
    <form action={action} className="space-y-4">
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
            placeholder={String(homeScore)}
            value={requestedHomeScore}
            onChange={(event) => setRequestedHomeScore(event.target.value)}
          />
          <label className="text-muted mt-2 flex items-center gap-2 text-sm">
            <input
              name="requestedHomeForfeit"
              type="checkbox"
              checked={requestedHomeForfeit}
              onChange={(event) => {
                setRequestedHomeForfeit(event.target.checked);
                if (event.target.checked) setRequestedAwayForfeit(false);
              }}
            />
            {homeTeamName} forfeited
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
            placeholder={String(awayScore)}
            value={requestedAwayScore}
            onChange={(event) => setRequestedAwayScore(event.target.value)}
          />
          <label className="text-muted mt-2 flex items-center gap-2 text-sm">
            <input
              name="requestedAwayForfeit"
              type="checkbox"
              checked={requestedAwayForfeit}
              onChange={(event) => {
                setRequestedAwayForfeit(event.target.checked);
                if (event.target.checked) setRequestedHomeForfeit(false);
              }}
            />
            {awayTeamName} forfeited
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
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <SubmitButton ready={ready} />
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
