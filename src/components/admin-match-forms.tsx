"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postJson, type ApiResult } from "@/components/match-actions";
import { Alert, Card, Field, buttonClass, inputClass } from "@/components/ui";
import { toDateTimeInputValue } from "@/lib/dates";
import {
  ADMIN_SETTABLE_MATCH_STATUSES,
  KIT_CHOICES,
  KIT_LABELS,
  MATCH_STATUS_LABELS,
  type KitChoice,
} from "@/lib/enums";
import { kitColorName, kitsClash, resolveKit, type TeamColors } from "@/lib/kits";

interface Option {
  id: string;
  name: string;
}

interface FixtureTeam extends Option {
  divisionId: string;
}

export function AdminMatchForms({
  matchId,
  status,
  kickoffAt,
  venueName,
  matchweek,
  countsForStandings,
  refereeId,
  hasReport,
  divisionId,
  homeTeamId,
  awayTeamId,
  divisions,
  teams,
  homeTeamName,
  awayTeamName,
  homeTeam,
  awayTeam,
  homeKit,
  awayKit,
  currentHomeScore,
  currentAwayScore,
  referees,
}: {
  matchId: string;
  status: string;
  kickoffAt: string;
  venueName: string | null;
  matchweek: string;
  countsForStandings: boolean;
  refereeId: string | null;
  hasReport: boolean;
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string;
  divisions: Option[];
  teams: FixtureTeam[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeam: TeamColors;
  awayTeam: TeamColors;
  homeKit: KitChoice;
  awayKit: KitChoice;
  currentHomeScore: number;
  currentAwayScore: number;
  referees: Option[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<(ApiResult & { form?: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [home, setHome] = useState<KitChoice>(homeKit);
  const [away, setAway] = useState<KitChoice>(awayKit);
  const [division, setDivision] = useState(divisionId);

  const eligible = teams.filter((team) => team.divisionId === division);
  const pick = (preferred: string, exclude?: string): string => {
    if (preferred !== exclude && eligible.some((team) => team.id === preferred)) return preferred;
    return eligible.find((team) => team.id !== exclude)?.id ?? "";
  };
  const fixtureHome = pick(homeTeamId);
  const fixtureAway = pick(awayTeamId, fixtureHome);

  const homeColor = resolveKit(homeTeam, home);
  const awayColor = resolveKit(awayTeam, away);
  const clash = kitsClash(homeColor, awayColor);

  async function send(form: string, url: string, body: unknown) {
    setBusy(form);
    setResult(null);
    const outcome = await postJson(url, body);
    setResult({ ...outcome, form });
    setBusy(null);
    if (outcome.ok) router.refresh();
  }

  function feedback(form: string) {
    if (!result || result.form !== form) return null;
    return (
      <Alert tone={result.ok ? "success" : "danger"} className="mt-3">
        {result.ok ? (result.message ?? "Saved.") : result.error}
      </Alert>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ----------------------------- Reschedule --------------------------- */}
      <Card className="p-5">
        <h3 className="font-semibold">Schedule, status &amp; kits</h3>
        <p className="text-muted mt-1 text-xs">
          Rescheduling, postponing, cancelling or re-kitting a fixture is audited with your reason.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const local = String(data.get("kickoffAt") ?? "");
            void send("schedule", `/api/matches/${matchId}/schedule`, {
              // Sent as a bare wall-clock string; the server reads it as
              // league (Redmond) time regardless of where the admin is.
              kickoffAt: local || undefined,
              venueName: (data.get("venueName") as string) || null,
              status: String(data.get("status") ?? "") || undefined,
              matchweek: String(data.get("matchweek") ?? "") || undefined,
              // A cleared checkbox is simply absent from the FormData.
              countsForStandings: data.get("countsForStandings") === "on",
              homeKit: String(data.get("homeKit") ?? ""),
              awayKit: String(data.get("awayKit") ?? ""),
              reason: String(data.get("reason") ?? ""),
            });
          }}
        >
          <Field label="Kick-off" htmlFor="kickoffAt" hint="Redmond time.">
            <input
              id="kickoffAt"
              name="kickoffAt"
              type="datetime-local"
              defaultValue={toDateTimeInputValue(kickoffAt)}
              className={inputClass}
            />
          </Field>
          <Field label="Venue" htmlFor="venueName" hint="Free text. Blank shows as TBD.">
            <input
              id="venueName"
              name="venueName"
              type="text"
              defaultValue={venueName ?? ""}
              placeholder="To be confirmed"
              className={inputClass}
            />
          </Field>
          <Field
            label="Matchweek"
            htmlFor="matchweek"
            hint="Free text — 7, or Final for a knockout tie."
          >
            <input
              id="matchweek"
              name="matchweek"
              type="text"
              maxLength={40}
              defaultValue={matchweek}
              className={inputClass}
            />
          </Field>
          {/*
            Confirming a result and calling a match off are the only two status
            decisions an admin makes; everything else about a fixture's state is
            read off the referee and the report, which is also why Confirmed is
            a safe default — on a fixture nobody has played it says nothing and
            counts for nothing.
          */}
          <Field
            label="Status"
            htmlFor="status"
            hint="Leave it alone unless you are calling the fixture off."
          >
            <select
              id="status"
              name="status"
              defaultValue={
                (ADMIN_SETTABLE_MATCH_STATUSES as readonly string[]).includes(status)
                  ? status
                  : "CONFIRMED"
              }
              className={inputClass}
            >
              {ADMIN_SETTABLE_MATCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {MATCH_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason" htmlFor="schedule-reason" hint="Shown in the audit log.">
            <input
              id="schedule-reason"
              name="reason"
              className={inputClass}
              placeholder="Pitch waterlogged"
            />
          </Field>

          {/*
            A cup final or a friendly still needs a fixture, a referee and a
            report — it just must not move the league table. Clearing this
            keeps the result off the standings without hiding the match.
          */}
          <label className="border-subtle flex items-start gap-2 rounded-lg border p-3 text-sm sm:col-span-2">
            <input
              id="countsForStandings"
              name="countsForStandings"
              type="checkbox"
              defaultChecked={countsForStandings}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Counts towards the league table
              <span className="text-muted block text-xs">
                Clear it for a final, play-off or friendly. The fixture still appears in the
                schedule and the referee still files a report.
              </span>
            </span>
          </label>

          <fieldset className="border-subtle grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <legend className="text-muted px-1 text-xs font-semibold uppercase">Kits</legend>
            <KitField
              id="homeKit"
              label={`${homeTeamName} wears`}
              value={home}
              onChange={setHome}
              color={homeColor}
            />
            <KitField
              id="awayKit"
              label={`${awayTeamName} wears`}
              value={away}
              onChange={setAway}
              color={awayColor}
            />
            {clash ? (
              <p className="text-warning text-xs sm:col-span-2">
                These two kits are too close in colour to tell apart from the touchline. Switch one
                side to its other kit.
              </p>
            ) : null}
          </fieldset>

          <button type="submit" disabled={busy === "schedule"} className={buttonClass("primary")}>
            {busy === "schedule" ? "Saving\u2026" : "Save schedule"}
          </button>
          {feedback("schedule")}
        </form>
      </Card>

      {/* -------------------------- Who is playing -------------------------- */}
      <Card className="p-5">
        <h3 className="font-semibold">Teams &amp; league</h3>
        <p className="text-muted mt-1 text-xs">
          Correct a fixture entered against the wrong clubs or the wrong league. Changing the league
          re-filters both team lists.
        </p>
        {hasReport ? (
          <Alert tone="warning" className="mt-4">
            A report has been filed, so the teams are fixed &mdash; every goal and card names one of
            them. Override the result above, or delete and re-create the fixture.
          </Alert>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void send("fixture", `/api/matches/${matchId}/schedule`, {
                divisionId: String(data.get("divisionId") ?? ""),
                homeTeamId: String(data.get("homeTeamId") ?? ""),
                awayTeamId: String(data.get("awayTeamId") ?? ""),
                reason: String(data.get("reason") ?? ""),
              });
            }}
          >
            <Field label="League" htmlFor="fixture-division">
              <select
                id="fixture-division"
                name="divisionId"
                value={division}
                onChange={(event) => setDivision(event.target.value)}
                className={inputClass}
              >
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            {eligible.length < 2 ? (
              <Alert tone="warning">
                This league has fewer than two clubs, so no fixture can be built from it yet.
              </Alert>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Home team" htmlFor="fixture-home">
                  <select
                    id="fixture-home"
                    name="homeTeamId"
                    defaultValue={fixtureHome}
                    key={`home-${division}`}
                    className={inputClass}
                  >
                    {eligible.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Away team" htmlFor="fixture-away">
                  <select
                    id="fixture-away"
                    name="awayTeamId"
                    defaultValue={fixtureAway}
                    key={`away-${division}`}
                    className={inputClass}
                  >
                    {eligible.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <Field label="Reason" htmlFor="fixture-reason" hint="Shown in the audit log.">
              <input
                id="fixture-reason"
                name="reason"
                className={inputClass}
                placeholder="Entered against the wrong club"
              />
            </Field>
            <button
              type="submit"
              disabled={busy === "fixture" || eligible.length < 2}
              className={buttonClass("primary")}
            >
              {busy === "fixture" ? "Saving\u2026" : "Save teams"}
            </button>
            {feedback("fixture")}
          </form>
        )}
      </Card>

      {/* ------------------------------ Officials --------------------------- */}
      <Card className="p-5">
        <h3 className="font-semibold">Officials</h3>
        <p className="text-muted mt-1 text-xs">
          Force-assign a referee, or clear the assignment to put the fixture back on the open list.
          A referee cannot release a match once they have filed the report.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send("referee", `/api/matches/${matchId}/referee`, {
              refereeId: (data.get("refereeId") as string) || null,
              reason: String(data.get("reason") ?? ""),
            });
          }}
        >
          <Field label="Referee" htmlFor="refereeId">
            <select
              id="refereeId"
              name="refereeId"
              defaultValue={refereeId ?? ""}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {referees.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason" htmlFor="referee-reason">
            <input
              id="referee-reason"
              name="reason"
              className={inputClass}
              placeholder="Original referee unavailable"
            />
          </Field>
          <button type="submit" disabled={busy === "referee"} className={buttonClass("primary")}>
            {busy === "referee" ? "Saving\u2026" : "Save referee"}
          </button>
          {feedback("referee")}
        </form>
      </Card>

      {/* ------------------------------- Override --------------------------- */}
      {/* Always available: a referee may never file a report, and the league
          still has to be able to put the result on the table. */}
      <Card className="p-5 lg:col-span-2">
        <h3 className="font-semibold">{hasReport ? "Override the result" : "Enter the result"}</h3>
        <p className="text-muted mt-1 text-xs">
          {hasReport
            ? "Use only to correct a filed report. The original stays in the audit log, a reason is mandatory, and standings recompute from the corrected figures."
            : "No referee report was filed. Entering the score here creates the report on the referee's behalf, confirmed and counted in the standings. A reason is mandatory and the entry is audited."}
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send("override", `/api/matches/${matchId}/override`, {
              homeScore: Number(data.get("homeScore")),
              awayScore: Number(data.get("awayScore")),
              homeForfeit: data.get("homeForfeit") === "on",
              awayForfeit: data.get("awayForfeit") === "on",
              reason: String(data.get("reason") ?? ""),
            });
          }}
        >
          <Field label={`${homeTeamName} score`} htmlFor="homeScore">
            <input
              id="homeScore"
              name="homeScore"
              type="number"
              min={0}
              max={99}
              defaultValue={currentHomeScore}
              className={inputClass}
              required
            />
          </Field>
          <Field label={`${awayTeamName} score`} htmlFor="awayScore">
            <input
              id="awayScore"
              name="awayScore"
              type="number"
              min={0}
              max={99}
              defaultValue={currentAwayScore}
              className={inputClass}
              required
            />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="homeForfeit" className="h-4 w-4" />
              {homeTeamName} forfeit
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="awayForfeit" className="h-4 w-4" />
              {awayTeamName} forfeit
            </label>
          </div>
          <Field label="Reason (required)" htmlFor="override-reason">
            <input
              id="override-reason"
              name="reason"
              minLength={5}
              required
              className={inputClass}
              placeholder="Scorer mis-recorded, corrected by committee"
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={busy === "override"} className={buttonClass("danger")}>
              {busy === "override"
                ? "Applying\u2026"
                : hasReport
                  ? "Override result"
                  : "Enter result"}
            </button>
            {feedback("override")}
          </div>
        </form>
      </Card>
    </div>
  );
}

function KitField({
  id,
  label,
  value,
  onChange,
  color,
}: {
  id: string;
  label: string;
  value: KitChoice;
  onChange: (next: KitChoice) => void;
  color: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/20 dark:ring-white/25"
          style={{ backgroundColor: color }}
        />
        <select
          id={id}
          name={id}
          value={value}
          onChange={(event) => onChange(event.target.value as KitChoice)}
          className={inputClass}
        >
          {KIT_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {KIT_LABELS[choice]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-muted mt-1 text-[11px]">{kitColorName(color)}</p>
    </Field>
  );
}
