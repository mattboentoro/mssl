"use client";

import { useMemo, useState } from "react";

import { FieldError } from "@/components/admin-forms";
import { Alert, Field, inputClass } from "@/components/ui";
import { KIT_CHOICES, KIT_LABELS, type KitChoice } from "@/lib/enums";
import { kitColorName, kitsClash, resolveKit } from "@/lib/kits";

export interface KitPickerTeam {
  id: string;
  name: string;
  divisionId: string;
  colorPrimary: string;
  colorAlternate: string;
}

/**
 * Division, team and kit selection for a fixture.
 *
 * The division select lives in here rather than in the page so that choosing a
 * division can narrow the two team selects to that division's clubs. Offering
 * the whole league made it far too easy to schedule a cross-division fixture by
 * accident, and nothing downstream would have questioned it.
 *
 * Home and away selects sit alongside the kit selects so the clash warning can
 * update as the admin changes any of the four. The colour itself is never
 * posted -- only which kit each side wears -- so re-colouring a team later
 * updates its fixtures automatically.
 */
export function MatchKitPicker({
  teams,
  divisions,
  defaultDivisionId,
  defaultHomeTeamId,
  defaultAwayTeamId,
  defaultHomeKit = "PRIMARY",
  defaultAwayKit = "ALTERNATE",
}: {
  teams: KitPickerTeam[];
  divisions: { id: string; name: string }[];
  defaultDivisionId?: string;
  defaultHomeTeamId?: string;
  defaultAwayTeamId?: string;
  defaultHomeKit?: KitChoice;
  defaultAwayKit?: KitChoice;
}) {
  const [divisionId, setDivisionId] = useState(defaultDivisionId ?? divisions[0]?.id ?? "");
  const eligible = useMemo(
    () => teams.filter((t) => t.divisionId === divisionId),
    [teams, divisionId],
  );

  const [homeTeamId, setHomeTeamId] = useState(defaultHomeTeamId ?? "");
  const [awayTeamId, setAwayTeamId] = useState(defaultAwayTeamId ?? "");
  const [homeKit, setHomeKit] = useState<KitChoice>(defaultHomeKit);
  const [awayKit, setAwayKit] = useState<KitChoice>(defaultAwayKit);

  // A select whose value is not among its options renders as blank but still
  // posts nothing, so switching division has to move the picks with it.
  const homeSelected = eligible.some((t) => t.id === homeTeamId)
    ? homeTeamId
    : (eligible[0]?.id ?? "");
  const awaySelected = eligible.some((t) => t.id === awayTeamId)
    ? awayTeamId
    : (eligible.find((t) => t.id !== homeSelected)?.id ?? "");

  const home = useMemo(() => eligible.find((t) => t.id === homeSelected), [eligible, homeSelected]);
  const away = useMemo(() => eligible.find((t) => t.id === awaySelected), [eligible, awaySelected]);

  const homeColor = home ? resolveKit(home, homeKit) : null;
  const awayColor = away ? resolveKit(away, awayKit) : null;
  const clash = homeColor && awayColor ? kitsClash(homeColor, awayColor) : false;
  const sameTeam = homeSelected !== "" && homeSelected === awaySelected;

  return (
    <>
      <Field label="Division" htmlFor="new-division">
        <select
          id="new-division"
          name="divisionId"
          value={divisionId}
          onChange={(event) => setDivisionId(event.target.value)}
          className={inputClass}
          required
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <FieldError name="divisionId" />
      </Field>

      <Field label="Home team" htmlFor="new-home">
        <select
          id="new-home"
          name="homeTeamId"
          value={homeSelected}
          onChange={(event) => setHomeTeamId(event.target.value)}
          className={inputClass}
          required
        >
          {eligible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <FieldError name="homeTeamId" />
      </Field>

      <Field label="Away team" htmlFor="new-away">
        <select
          id="new-away"
          name="awayTeamId"
          value={awaySelected}
          onChange={(event) => setAwayTeamId(event.target.value)}
          className={inputClass}
          required
        >
          {eligible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <FieldError name="awayTeamId" />
      </Field>

      <KitSelect
        id="new-home-kit"
        name="homeKit"
        label={`${home?.name ?? "Home"} wears`}
        value={homeKit}
        onChange={setHomeKit}
        color={homeColor}
      />
      <KitSelect
        id="new-away-kit"
        name="awayKit"
        label={`${away?.name ?? "Away"} wears`}
        value={awayKit}
        onChange={setAwayKit}
        color={awayColor}
      />

      {eligible.length < 2 ? (
        <div className="sm:col-span-2">
          <Alert tone="warning">
            This division needs at least two clubs before you can schedule a fixture in it. Add them
            under League setup.
          </Alert>
        </div>
      ) : sameTeam ? (
        <div className="sm:col-span-2">
          <Alert tone="danger">A team cannot play itself. Pick two different sides.</Alert>
        </div>
      ) : clash ? (
        <div className="sm:col-span-2">
          <Alert tone="warning" title="Kit clash">
            {home?.name} ({(homeColor ? kitColorName(homeColor) : "").toLowerCase()}) and{" "}
            {away?.name} ({(awayColor ? kitColorName(awayColor) : "").toLowerCase()}) are too close
            in colour to tell apart. Switch one side to its other kit.
          </Alert>
        </div>
      ) : null}
    </>
  );
}

function KitSelect({
  id,
  name,
  label,
  value,
  onChange,
  color,
}: {
  id: string;
  name: string;
  label: string;
  value: KitChoice;
  onChange: (next: KitChoice) => void;
  color: string | null;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        {color ? (
          <span
            aria-hidden
            className="inline-block h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/20"
            style={{ backgroundColor: color }}
          />
        ) : null}
        <select
          id={id}
          name={name}
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
      {color ? <p className="text-muted mt-1 text-[11px]">{kitColorName(color)}</p> : null}
    </Field>
  );
}
