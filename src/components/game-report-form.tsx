"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { postJson } from "@/components/match-actions";
import { Alert, Button, Field, inputClass, labelClass } from "@/components/ui";
import { GAME_EVENT_LABELS, type GameEventType } from "@/lib/enums";

export interface ReportTeam {
  id: string;
  name: string;
  players: { id: string; firstName: string; lastName: string; jerseyNumber: number | null }[];
}

interface EventDraft {
  key: string;
  type: GameEventType;
  teamId: string;
  playerId: string;
  minute: string;
  note: string;
}

const GOAL_TYPES: GameEventType[] = ["GOAL", "PENALTY_GOAL", "OWN_GOAL"];

const newKey = () => Math.random().toString(36).slice(2, 10);

/** Goals implied by the event list. Mirrors `tallyGoalsFromEvents` on the server. */
function tally(events: EventDraft[], homeTeamId: string, awayTeamId: string) {
  let home = 0;
  let away = 0;
  for (const event of events) {
    if (!GOAL_TYPES.includes(event.type)) continue;
    const creditsHome =
      (event.teamId === homeTeamId && event.type !== "OWN_GOAL") ||
      (event.teamId === awayTeamId && event.type === "OWN_GOAL");
    if (creditsHome) home += 1;
    else if (event.teamId === homeTeamId || event.teamId === awayTeamId) away += 1;
  }
  return { home, away };
}

export function GameReportForm({
  matchId,
  homeTeam,
  awayTeam,
}: {
  matchId: string;
  homeTeam: ReportTeam;
  awayTeam: ReportTeam;
}) {
  const router = useRouter();

  const [homeScore, setHomeScore] = useState("0");
  const [awayScore, setAwayScore] = useState("0");
  const [homeForfeit, setHomeForfeit] = useState(false);
  const [awayForfeit, setAwayForfeit] = useState(false);
  const [notes, setNotes] = useState("");
  const [incidentReport, setIncidentReport] = useState("");
  const [misconduct, setMisconduct] = useState("");
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const teams = useMemo(() => [homeTeam, awayTeam], [homeTeam, awayTeam]);
  const derived = useMemo(
    () => tally(events, homeTeam.id, awayTeam.id),
    [events, homeTeam.id, awayTeam.id],
  );

  const anyForfeit = homeForfeit || awayForfeit;
  const scoreMismatch =
    !anyForfeit && (derived.home !== Number(homeScore) || derived.away !== Number(awayScore));

  function addEvent(type: GameEventType) {
    setEvents((current) => [
      ...current,
      { key: newKey(), type, teamId: homeTeam.id, playerId: "", minute: "", note: "" },
    ]);
  }

  function updateEvent(key: string, patch: Partial<EventDraft>) {
    setEvents((current) =>
      current.map((event) => {
        if (event.key !== key) return event;
        const next = { ...event, ...patch };
        // Changing team invalidates the selected player.
        if (patch.teamId && patch.teamId !== event.teamId) next.playerId = "";
        return next;
      }),
    );
  }

  function removeEvent(key: string) {
    setEvents((current) => current.filter((event) => event.key !== key));
  }

  /** Copy the itemised goal tally into the score boxes. */
  function syncScoreFromEvents() {
    setHomeScore(String(derived.home));
    setAwayScore(String(derived.away));
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await postJson(`/api/matches/${matchId}/report`, {
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      homeForfeit,
      awayForfeit,
      notes: notes || null,
      incidentReport: incidentReport || null,
      misconduct: misconduct || null,
      events: events.map((event) => ({
        type: event.type,
        teamId: event.teamId,
        playerId: event.playerId || null,
        minute: Number(event.minute),
        note: event.note || null,
      })),
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? "Could not submit the report.");
      setFieldErrors(result.fields ?? {});
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? (
        <Alert title="The report was not accepted">
          <p>{error}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="mt-2 list-inside list-disc">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <span className="font-mono text-xs">{field}</span>: {message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Final score</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label={homeTeam.name} htmlFor="homeScore">
            <input
              id="homeScore"
              name="homeScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              required
              value={homeScore}
              onChange={(e) => setHomeScore(e.target.value)}
              className={`${inputClass} text-center text-2xl font-bold`}
            />
          </Field>
          <Field label={awayTeam.name} htmlFor="awayScore">
            <input
              id="awayScore"
              name="awayScore"
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              required
              value={awayScore}
              onChange={(e) => setAwayScore(e.target.value)}
              className={`${inputClass} text-center text-2xl font-bold`}
            />
          </Field>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="border-subtle flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={homeForfeit}
              onChange={(e) => setHomeForfeit(e.target.checked)}
              className="h-4 w-4"
            />
            {homeTeam.name} forfeited
          </label>
          <label className="border-subtle flex items-center gap-2 rounded-lg border p-3 text-sm">
            <input
              type="checkbox"
              checked={awayForfeit}
              onChange={(e) => setAwayForfeit(e.target.checked)}
              className="h-4 w-4"
            />
            {awayTeam.name} forfeited
          </label>
        </div>

        {anyForfeit ? (
          <Alert tone="warning" title="Forfeit recorded">
            The standings will apply the league&rsquo;s default forfeit scoreline, so the itemised
            goals below do not have to add up.
            {homeForfeit && awayForfeit ? " A double forfeit must be entered as 0-0." : null}
          </Alert>
        ) : scoreMismatch ? (
          <Alert tone="warning" title="Score does not match the goals below">
            <p>
              You entered {homeScore}&ndash;{awayScore} but have itemised {derived.home}&ndash;
              {derived.away}. Add the missing goals or{" "}
              <button type="button" onClick={syncScoreFromEvents} className="underline">
                use the itemised total
              </button>
              . The server rejects reports that do not agree.
            </p>
          </Alert>
        ) : (
          <p role="status" className="text-success text-xs">
            Score matches the {events.filter((e) => GOAL_TYPES.includes(e.type)).length} itemised
            goal{events.filter((e) => GOAL_TYPES.includes(e.type)).length === 1 ? "" : "s"}.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Goals and cards</legend>
        <div className="flex flex-wrap gap-2">
          {(["GOAL", "PENALTY_GOAL", "OWN_GOAL", "YELLOW", "RED", "SUBSTITUTION"] as const).map(
            (type) => (
              <Button
                key={type}
                type="button"
                variant="secondary"
                onClick={() => addEvent(type)}
                className="px-3 py-1.5 text-xs"
              >
                + {GAME_EVENT_LABELS[type]}
              </Button>
            ),
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-muted text-sm">
            No events yet. A 0&ndash;0 draw needs none; otherwise add one row per goal and card.
          </p>
        ) : (
          <ul className="space-y-3">
            {events.map((event, index) => {
              const team = teams.find((t) => t.id === event.teamId) ?? homeTeam;
              return (
                <li key={event.key} className="border-subtle rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-muted text-xs font-semibold uppercase">
                      {GAME_EVENT_LABELS[event.type]} #{index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEvent(event.key)}
                      className="text-danger text-xs hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelClass} htmlFor={`${event.key}-team`}>
                        Team
                      </label>
                      <select
                        id={`${event.key}-team`}
                        value={event.teamId}
                        onChange={(e) => updateEvent(event.key, { teamId: e.target.value })}
                        className={inputClass}
                      >
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor={`${event.key}-player`}>
                        Player
                      </label>
                      <select
                        id={`${event.key}-player`}
                        value={event.playerId}
                        onChange={(e) => updateEvent(event.key, { playerId: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Unattributed</option>
                        {team.players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.jerseyNumber ? `#${player.jerseyNumber} ` : ""}
                            {player.firstName} {player.lastName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`${event.key}-minute`}>
                        Minute
                      </label>
                      <input
                        id={`${event.key}-minute`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={130}
                        required
                        value={event.minute}
                        onChange={(e) => updateEvent(event.key, { minute: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className={labelClass} htmlFor={`${event.key}-note`}>
                      Note (optional)
                    </label>
                    <input
                      id={`${event.key}-note`}
                      type="text"
                      maxLength={280}
                      value={event.note}
                      onChange={(e) => updateEvent(event.key, { note: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-base font-semibold">Referee notes</legend>
        <Field label="Match notes" htmlFor="notes" hint="Shown to league admins only.">
          <textarea
            id="notes"
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Incident report"
          htmlFor="incidentReport"
          hint="Injuries, abandonment, crowd issues. Never shown publicly."
        >
          <textarea
            id="incidentReport"
            rows={3}
            maxLength={4000}
            value={incidentReport}
            onChange={(e) => setIncidentReport(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Misconduct"
          htmlFor="misconduct"
          hint="Detail behind any red card or reportable behaviour."
        >
          <textarea
            id="misconduct"
            rows={3}
            maxLength={4000}
            value={misconduct}
            onChange={(e) => setMisconduct(e.target.value)}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <div className="border-subtle flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Submitting\u2026" : "Submit game report"}
        </Button>
        <p className="text-muted text-xs">
          Once submitted the report is read-only to you. Corrections go through a league admin.
        </p>
      </div>
    </form>
  );
}
