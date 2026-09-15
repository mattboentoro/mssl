"use client";

import { useMemo, useState } from "react";

import { FieldError } from "@/components/admin-forms";
import { Alert, Field, inputClass } from "@/components/ui";
import { KIT_CHOICES, KIT_LABELS, type KitChoice } from "@/lib/enums";
import { kitColorName, kitsClash, resolveKit } from "@/lib/kits";

export interface KitPickerTeam {
  id: string;
  name: string;
  colorPrimary: string;
  colorAlternate: string;
}

/**
 * Team + kit selection for a fixture.
 *
 * Home and away selects live in here alongside the kit selects so the clash
 * warning can update as the admin changes any of the four. The colour itself is
 * never posted — only which kit each side wears — so re-colouring a team later
 * updates its fixtures automatically.
 */
export function MatchKitPicker({
  teams,
  defaultHomeTeamId,
  defaultAwayTeamId,
  defaultHomeKit = "PRIMARY",
  defaultAwayKit = "ALTERNATE",
}: {
  teams: KitPickerTeam[];
  defaultHomeTeamId?: string;
  defaultAwayTeamId?: string;
  defaultHomeKit?: KitChoice;
  defaultAwayKit?: KitChoice;
}) {
  const [homeTeamId, setHomeTeamId] = useState(defaultHomeTeamId ?? teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(defaultAwayTeamId ?? teams[1]?.id ?? "");
  const [homeKit, setHomeKit] = useState<KitChoice>(defaultHomeKit);
  const [awayKit, setAwayKit] = useState<KitChoice>(defaultAwayKit);

  const home = useMemo(() => teams.find((t) => t.id === homeTeamId), [teams, homeTeamId]);
  const away = useMemo(() => teams.find((t) => t.id === awayTeamId), [teams, awayTeamId]);

  const homeColor = home ? resolveKit(home, homeKit) : null;
  const awayColor = away ? resolveKit(away, awayKit) : null;
  const clash = homeColor && awayColor ? kitsClash(homeColor, awayColor) : false;
  const sameTeam = homeTeamId !== "" && homeTeamId === awayTeamId;

  return (
    <>
      <Field label="Home team" htmlFor="new-home">
        <select
          id="new-home"
          name="homeTeamId"
          value={homeTeamId}
          onChange={(event) => setHomeTeamId(event.target.value)}
          className={inputClass}
          required
        >
          {teams.map((t) => (
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
          value={awayTeamId}
          onChange={(event) => setAwayTeamId(event.target.value)}
          className={inputClass}
          required
        >
          {teams.map((t) => (
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

      {sameTeam ? (
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
            className="inline-block h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/20 dark:ring-white/25"
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
