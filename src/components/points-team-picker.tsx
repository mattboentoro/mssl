"use client";

import { useState } from "react";

import { FieldError } from "@/components/admin-forms";
import { Field, inputClass } from "@/components/ui";

export interface PickerTeam {
  id: string;
  name: string;
  divisionId: string;
  divisionName: string;
}

interface Props {
  divisions: { id: string; name: string }[];
  teams: PickerTeam[];
}

/**
 * League filter and team picker for a points adjustment.
 *
 * Every team is sent to the browser once, so choosing a league re-populates the
 * team list immediately instead of reloading the page. Remounting the team
 * select on each league change (via `key`) resets the selection to the first
 * club in the new list, which stops an admin from submitting a team they can no
 * longer see.
 */
export function PointsTeamPicker({ divisions, teams }: Props) {
  const [divisionId, setDivisionId] = useState("");
  const visible = divisionId ? teams.filter((team) => team.divisionId === divisionId) : teams;
  const leagueName = divisions.find((division) => division.id === divisionId)?.name;

  return (
    <>
      {divisions.length > 1 ? (
        <Field label="Filter teams by league" htmlFor="adj-division">
          <select
            id="adj-division"
            value={divisionId}
            onChange={(event) => setDivisionId(event.target.value)}
            className={inputClass}
          >
            <option value="">All leagues</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <Field label="Team" htmlFor="adj-team">
        {visible.length === 0 ? (
          <p className="text-muted py-2 text-sm">
            {leagueName ? `No teams in ${leagueName} yet.` : "No teams in this season yet."}
          </p>
        ) : (
          <select
            key={divisionId}
            id="adj-team"
            name="teamId"
            className={inputClass}
            required
            aria-describedby={divisionId ? "adj-team-scope" : undefined}
          >
            {visible.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} &mdash; {team.divisionName}
              </option>
            ))}
          </select>
        )}
        {divisionId && visible.length > 0 ? (
          <p id="adj-team-scope" className="text-muted mt-1 text-xs">
            Showing {visible.length} of {teams.length} teams.
          </p>
        ) : null}
        <FieldError name="teamId" />
      </Field>
    </>
  );
}
