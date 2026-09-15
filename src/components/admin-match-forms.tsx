"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postJson, type ApiResult } from "@/components/match-actions";
import { Alert, Card, Field, buttonClass, inputClass } from "@/components/ui";
import { toDateTimeInputValue } from "@/lib/dates";
import {
  KIT_CHOICES,
  KIT_LABELS,
  MATCH_STATUSES,
  MATCH_STATUS_LABELS,
  type KitChoice,
} from "@/lib/enums";
import { kitsClash, resolveKit, type TeamColors } from "@/lib/kits";

interface Option {
  id: string;
  name: string;
}

export function AdminMatchForms({
  matchId,
  status,
  kickoffAt,
  venueId,
  refereeId,
  hasReport,
  homeTeamName,
  awayTeamName,
  homeTeam,
  awayTeam,
  homeKit,
  awayKit,
  currentHomeScore,
  currentAwayScore,
  referees,
  venues,
}: {
  matchId: string;
  status: string;
  kickoffAt: string;
  venueId: string | null;
  refereeId: string | null;
  hasReport: boolean;
  homeTeamName: string;
  awayTeamName: string;
  homeTeam: TeamColors;
  awayTeam: TeamColors;
  homeKit: KitChoice;
  awayKit: KitChoice;
  currentHomeScore: number;
  currentAwayScore: number;
  referees: Option[];
  venues: Option[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<(ApiResult & { form?: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [home, setHome] = useState<KitChoice>(homeKit);
  const [away, setAway] = useState<KitChoice>(awayKit);

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
              venueId: (data.get("venueId") as string) || null,
              status: String(data.get("status") ?? ""),
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
          <Field label="Venue" htmlFor="venueId">
            <select id="venueId" name="venueId" defaultValue={venueId ?? ""} className={inputClass}>
              <option value="">To be confirmed</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={status} className={inputClass}>
              {MATCH_STATUSES.map((s) => (
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
      {hasReport ? (
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold">Override the result</h3>
          <p className="text-muted mt-1 text-xs">
            Use only to correct a filed report. The original stays in the audit log, a reason is
            mandatory, and standings recompute from the corrected figures.
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
              <button
                type="submit"
                disabled={busy === "override"}
                className={buttonClass("danger")}
              >
                {busy === "override" ? "Applying\u2026" : "Override result"}
              </button>
              {feedback("override")}
            </div>
          </form>
        </Card>
      ) : null}
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
      <p className="text-muted mt-1 font-mono text-[11px]">{color}</p>
    </Field>
  );
}
